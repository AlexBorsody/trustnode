-- Run after 012. Independent immutable-template forks; attribution never grants access.
begin;
alter table public.tn_source_edges add column creation_kind text not null default 'manual'
  check(creation_kind in ('manual','template-import'));
create table public.tn_template_origins (
  version_id uuid primary key references public.tn_pack_versions(id) on delete cascade,
  parent_version_id uuid not null references public.tn_pack_versions(id) on delete cascade,
  parent_evidence_revision bigint not null,
  created_at timestamptz not null default now(), check(version_id<>parent_version_id)
);
create table public.tn_edge_origins (
  edge_id uuid primary key references public.tn_source_edges(id) on delete cascade,
  imported_revision_id uuid not null references public.tn_edge_revisions(id) on delete cascade,
  parent_revision_id uuid not null references public.tn_edge_revisions(id) on delete cascade,
  check(imported_revision_id<>parent_revision_id)
);
create index tn_template_origins_parent on public.tn_template_origins(parent_version_id);
create index tn_edge_origins_parent on public.tn_edge_origins(parent_revision_id);
alter table public.tn_template_origins enable row level security;
alter table public.tn_edge_origins enable row level security;
revoke all on public.tn_template_origins,public.tn_edge_origins from public,anon,authenticated,tn_graph_worker;
grant select on public.tn_template_origins,public.tn_edge_origins to anon,authenticated;
create policy "mutually visible template origin" on public.tn_template_origins for select using (
  exists(select 1 from public.tn_pack_versions where id=version_id)
  and exists(select 1 from public.tn_pack_versions where id=parent_version_id)
);
create policy "mutually visible evidence origin" on public.tn_edge_origins for select using (
  exists(select 1 from public.tn_source_edges where id=edge_id)
  and exists(select 1 from public.tn_edge_revisions where id=parent_revision_id)
);

create table public.tn_template_fork_requests (
  requester_id uuid not null references auth.users(id) on delete cascade,
  request_key uuid not null, payload_hash text not null,
  -- A deleted child leaves a private request tombstone; retry cannot recreate it.
  version_id uuid references public.tn_pack_versions(id) on delete set null,
  copied_evidence integer not null, created_at timestamptz not null default now(),
  primary key(requester_id,request_key)
);
alter table public.tn_template_fork_requests enable row level security;
revoke all on public.tn_template_fork_requests from public,anon,authenticated,tn_graph_worker;

-- One MVCC statement captures the preview's tokens and counts under caller RLS.
create function public.tn_template_fork_info(p_version uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('version_id',v.id,'content_hash',v.content_hash,
    'evidence_revision',v.evidence_revision,'visibility_epoch',p.trust_visibility_epoch,
    'evidence_count',counts.total,'accepted_count',counts.accepted,
    'copy_limit',200,'copy_supported',counts.total<=200 and counts.bytes<=2097152,
    'origin',(select jsonb_build_object('version_id',parent.id,'pack_id',parent.pack_id,
      'title',pp.title,'owner_id',pp.owner_id,'pack_revision',parent.pack_revision,
      'evidence_revision',o.parent_evidence_revision)
      from public.tn_template_origins o join public.tn_pack_versions parent on parent.id=o.parent_version_id
      join public.tn_packs pp on pp.id=parent.pack_id where o.version_id=v.id))
  from public.tn_pack_versions v join public.tn_packs p on p.id=v.pack_id
  cross join lateral (
    select count(*) as total,count(*) filter(where d.action='accept') as accepted,
      coalesce(sum(octet_length(r.body::text)),0) as bytes
    from public.tn_source_edges e
    cross join lateral (select * from public.tn_edge_revisions where edge_id=e.id order by revision desc limit 1) r
    left join lateral (select action from public.tn_edge_reviews where revision_id=r.id
      and action in ('accept','reject','withdraw') order by id desc limit 1) d on true
    where e.template_version_id=v.id
  ) counts where v.id=p_version
$$;

create function public.tn_fork_template(p_version uuid,p_hash text,p_evidence_revision bigint,
  p_visibility_epoch bigint,p_copy_evidence boolean,p_title text,p_request_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); parent public.tn_packs; selected public.tn_pack_versions;
  child public.tn_packs; child_version uuid; body jsonb; fingerprint text; payload_hash text;
  previous public.tn_template_fork_requests; evidence record; created_pack uuid; created_edge uuid; created_revision uuid;
  copied integer:=0; count_edges bigint; evidence_bytes bigint;
begin
  if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or p_evidence_revision is null or p_evidence_revision<1
    or p_visibility_epoch is null or p_visibility_epoch<1 or p_copy_evidence is null or p_request_key is null
    or coalesce(length(btrim(p_title)),0) not between 1 and 120 then
    raise exception 'Supply captured inputs and fork choice' using errcode='22023'; end if;
  -- Same request key cannot race into multiple independent children.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text||p_request_key::text,13));
  payload_hash:=encode(sha256(convert_to(jsonb_build_array(p_version,p_hash,p_evidence_revision,
    p_visibility_epoch,p_copy_evidence,p_title)::text,'UTF8')),'hex');
  select * into previous from public.tn_template_fork_requests where requester_id=caller and request_key=p_request_key;
  if found then
    if previous.payload_hash<>payload_hash then raise exception 'Request key changed' using errcode='PT409'; end if;
    -- A retry returns only the caller's already-owned child, even if its parent
    -- disappeared after the original commit. It does not read/reveal parent state.
    select p.* into child from public.tn_packs p join public.tn_pack_versions v on v.pack_id=p.id
      where v.id=previous.version_id and p.owner_id=caller;
    if not found then raise exception 'Fork unavailable' using errcode='PT404'; end if;
    return jsonb_build_object('pack_id',child.id,'version_id',previous.version_id,'copied_evidence',previous.copied_evidence,'reused',true);
  end if;
  -- Serializes with visibility/deletion and the SHARE locks used by all evidence
  -- writes. Current pack edits are allowed: selected immutable inputs stay pinned.
  select p.* into parent from public.tn_packs p join public.tn_pack_versions v on v.pack_id=p.id
    where v.id=p_version and (p.is_public or p.owner_id=caller) for update of p;
  if not found then raise exception 'Template unavailable' using errcode='PT404'; end if;
  select * into selected from public.tn_pack_versions where id=p_version;
  if selected.content_hash<>p_hash or selected.evidence_revision<>p_evidence_revision
    or parent.trust_visibility_epoch<>p_visibility_epoch then
    raise exception 'Fork inputs changed' using errcode='PT409'; end if;
  if selected.snapshot->>'schema_version'<>'seed-template-v1' or selected.snapshot->>'policy_version'<>'accepted-edges-v1'
    or jsonb_array_length(selected.snapshot->'entries') not between 1 and 50 then
    raise exception 'Unsupported template' using errcode='PT422'; end if;
  -- A deleted source cannot be silently omitted from an otherwise exact fork.
  perform s.id from public.tn_sources s where s.id in (
    select (e->>'source_id')::uuid from jsonb_array_elements(selected.snapshot->'entries') e) order by s.id for share;
  if exists(select 1 from jsonb_array_elements(selected.snapshot->'entries') e where not exists(
    select 1 from public.tn_sources s where s.id=(e->>'source_id')::uuid and s.kind='link')) then
    raise exception 'A selected member is unavailable' using errcode='PT409'; end if;
  if p_copy_evidence then
    select count(*),coalesce(sum(octet_length(r.body::text)),0) into count_edges,evidence_bytes
      from public.tn_source_edges e cross join lateral (
        select er.body from public.tn_edge_revisions er where er.edge_id=e.id order by er.revision desc limit 1) r
      where e.template_version_id=p_version;
    if count_edges>200 or evidence_bytes>2097152 then raise exception 'Evidence copy exceeds limits' using errcode='PT422'; end if;
  end if;
  created_pack:=public.tn_create_pack(btrim(p_title),selected.snapshot->>'description',
    selected.snapshot->>'category',array(select jsonb_array_elements_text(selected.snapshot->'tags')),false,selected.snapshot->'entries');
  select * into child from public.tn_packs where id=created_pack;
  -- Preserve exactly selected source/seed entries, not current mutable source text.
  body:=selected.snapshot||jsonb_build_object('title',child.title,'owner_id',caller,'pack_revision',child.revision,
    'category_id',child.category_id,'category_key',child.category_key);
  fingerprint:=encode(sha256(convert_to(body::text,'UTF8')),'hex');
  insert into public.tn_pack_versions(pack_id,pack_revision,snapshot,content_hash)
    values(child.id,child.revision,body,fingerprint) returning id into child_version;
  insert into public.tn_pack_origins(pack_id,parent_id,parent_revision) values(child.id,parent.id,selected.pack_revision);
  insert into public.tn_template_origins(version_id,parent_version_id,parent_evidence_revision)
    values(child_version,p_version,selected.evidence_revision);
  if p_copy_evidence then
    for evidence in select r.* from public.tn_source_edges e cross join lateral (
      select * from public.tn_edge_revisions where edge_id=e.id order by revision desc limit 1) r
      where e.template_version_id=p_version order by e.id loop
      insert into public.tn_source_edges(template_version_id,author_id,creation_kind)
        values(child_version,caller,'template-import') returning id into created_edge;
      insert into public.tn_edge_revisions(edge_id,revision,body)
        values(created_edge,1,evidence.body||jsonb_build_object('origin','template-import')) returning id into created_revision;
      insert into public.tn_edge_origins(edge_id,imported_revision_id,parent_revision_id) values(created_edge,created_revision,evidence.id);
      copied:=copied+1;
    end loop;
  end if;
  -- No parent reviews, decisions, author IDs or provenance IDs enter child content.
  insert into public.tn_template_fork_requests(requester_id,request_key,payload_hash,version_id,copied_evidence)
    values(caller,p_request_key,payload_hash,child_version,copied);
  return jsonb_build_object('pack_id',child.id,'version_id',child_version,'copied_evidence',copied,'reused',false);
end $$;

-- Only this caller-RLS read decorates evidence with currently visible attribution.
-- Snapshot capture reads base rows, so private-parent IDs cannot freeze in exports.
create or replace function public.tn_list_relationships(p_version uuid,p_offset integer default 0) returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(summary) order by summary.created_at desc,summary.id),'[]'::jsonb)
  from (
    select e.*,to_jsonb(r) as current_revision,to_jsonb(d) as current_decision,
      (select jsonb_build_object('revision_id',pr.id,'imported_revision_id',o.imported_revision_id,
        'version_id',pe.template_version_id,'pack_id',pv.pack_id,'title',pp.title,
        'author_id',pe.author_id,'creation_kind',pe.creation_kind)
        from public.tn_edge_origins o join public.tn_edge_revisions pr on pr.id=o.parent_revision_id
        join public.tn_source_edges pe on pe.id=pr.edge_id join public.tn_pack_versions pv on pv.id=pe.template_version_id
        join public.tn_packs pp on pp.id=pv.pack_id where o.edge_id=e.id) as origin
    from (select * from public.tn_source_edges where template_version_id=p_version
      order by created_at desc,id limit 20 offset greatest(0,least(coalesce(p_offset,0),10000))) e
    cross join lateral (select * from public.tn_edge_revisions where edge_id=e.id order by revision desc limit 1) r
    left join lateral (select * from public.tn_edge_reviews where revision_id=r.id and action in ('accept','reject','withdraw') order by id desc limit 1) d on true
  ) summary
$$;
revoke all on function public.tn_template_fork_info(uuid),public.tn_fork_template(uuid,text,bigint,bigint,boolean,text,uuid) from public,anon,authenticated;
grant execute on function public.tn_template_fork_info(uuid) to anon,authenticated;
grant execute on function public.tn_fork_template(uuid,text,bigint,bigint,boolean,text,uuid) to authenticated;
commit;
