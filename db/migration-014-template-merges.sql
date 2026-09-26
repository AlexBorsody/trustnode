-- Run after 013. Explicit reconciliation of two saved versions; independent copies.
begin;
alter table public.tn_template_origins drop constraint tn_template_origins_pkey;
alter table public.tn_template_origins add primary key(version_id,parent_version_id);
alter table public.tn_edge_origins drop constraint tn_edge_origins_pkey;
alter table public.tn_edge_origins add primary key(edge_id,parent_revision_id);

create table public.tn_template_merge_requests (
  requester_id uuid not null references auth.users(id) on delete cascade,
  request_key uuid not null, payload_hash text not null,
  version_id uuid references public.tn_pack_versions(id) on delete set null,
  copied_evidence integer not null, created_at timestamptz not null default now(),
  primary key(requester_id,request_key)
);
alter table public.tn_template_merge_requests enable row level security;
revoke all on public.tn_template_merge_requests from public,anon,authenticated,tn_graph_worker;

create or replace function public.tn_template_fork_info(p_version uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('version_id',v.id,'content_hash',v.content_hash,
    'evidence_revision',v.evidence_revision,'visibility_epoch',p.trust_visibility_epoch,
    'evidence_count',counts.total,'accepted_count',counts.accepted,
    'copy_limit',200,'evidence_bytes',counts.bytes,'copy_supported',counts.total<=200 and counts.bytes<=2097152,
    'origins',(select coalesce(jsonb_agg(jsonb_build_object('version_id',parent.id,'pack_id',parent.pack_id,
      'title',pp.title,'owner_id',pp.owner_id,'pack_revision',parent.pack_revision,
      'evidence_revision',o.parent_evidence_revision) order by parent.id),'[]'::jsonb)
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

create or replace function public.tn_list_relationships(p_version uuid,p_offset integer default 0) returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(summary) order by summary.created_at desc,summary.id),'[]'::jsonb)
  from (
    select e.*,to_jsonb(r) as current_revision,to_jsonb(d) as current_decision,
      (select coalesce(jsonb_agg(jsonb_build_object('revision_id',pr.id,'imported_revision_id',o.imported_revision_id,
        'version_id',pe.template_version_id,'pack_id',pv.pack_id,'title',pp.title,
        'author_id',pe.author_id,'creation_kind',pe.creation_kind) order by pr.id),'[]'::jsonb)
        from public.tn_edge_origins o join public.tn_edge_revisions pr on pr.id=o.parent_revision_id
        join public.tn_source_edges pe on pe.id=pr.edge_id join public.tn_pack_versions pv on pv.id=pe.template_version_id
        join public.tn_packs pp on pp.id=pv.pack_id where o.edge_id=e.id) as origins
    from (select * from public.tn_source_edges where template_version_id=p_version
      order by created_at desc,id limit 20 offset greatest(0,least(coalesce(p_offset,0),10000))) e
    cross join lateral (select * from public.tn_edge_revisions where edge_id=e.id order by revision desc limit 1) r
    left join lateral (select * from public.tn_edge_reviews where revision_id=r.id and action in ('accept','reject','withdraw') order by id desc limit 1) d on true
  ) summary
$$;

create function public.tn_template_merge_info(p_version uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('version',to_jsonb(v),'info',public.tn_template_fork_info(v.id))
  from public.tn_pack_versions v where v.id=p_version
$$;

create function public.tn_merge_templates(p_input jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); merge_key uuid; payload_hash text; previous public.tn_template_merge_requests;
  parents jsonb; item jsonb; selected public.tn_pack_versions; metadata public.tn_pack_versions;
  pack_row record; visible_count integer:=0; version_ids uuid[];
  entries jsonb:='[]'; source_entry jsonb; source_meta jsonb; target_meta jsonb;
  child public.tn_packs; child_id uuid; child_version uuid; snapshot jsonb;
  evidence record; normalized jsonb; copied integer:=0; count_edges bigint; evidence_bytes bigint;
  copied_map jsonb:='{}'; fingerprint text; child_edge uuid; child_revision uuid; ordinal integer:=0;
begin
  if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if jsonb_typeof(p_input) is distinct from 'object' then raise exception 'Invalid merge' using errcode='22023'; end if;
  parents:=p_input->'parents';
  if jsonb_typeof(parents) is distinct from 'array' then raise exception 'Choose two versions' using errcode='22023'; end if;
  if jsonb_array_length(parents)<>2 or jsonb_typeof(p_input->'copy_evidence') is distinct from 'boolean'
    or p_input->>'seed_mode' is null or p_input->>'seed_mode' not in ('uniform-seeds-v1','ordered-seeds-v1')
    or jsonb_typeof(p_input->'title') is distinct from 'string' or length(btrim(p_input->>'title')) not between 1 and 120
    or jsonb_typeof(p_input->'entries') is distinct from 'array' or coalesce(p_input->>'request_key','')='' then
    raise exception 'Reconcile the merged template explicitly' using errcode='22023'; end if;
  merge_key:=(p_input->>'request_key')::uuid;
  for item in select * from jsonb_array_elements(parents) loop
    if coalesce(item->>'content_hash','') !~ '^[0-9a-f]{64}$'
      or coalesce(item->>'evidence_revision','') !~ '^[1-9][0-9]*$'
      or coalesce(item->>'visibility_epoch','') !~ '^[1-9][0-9]*$'
      or coalesce(item->>'version_id','')='' then raise exception 'Supply captured parent tokens' using errcode='22023'; end if;
  end loop;
  version_ids:=array(select (e->>'version_id')::uuid from jsonb_array_elements(parents) e);
  if version_ids[1]=version_ids[2] then raise exception 'Choose different parent packs' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text||merge_key::text,14));
  payload_hash:=encode(sha256(convert_to(p_input::text,'UTF8')),'hex');
  select * into previous from public.tn_template_merge_requests r where r.requester_id=caller and r.request_key=merge_key;
  if found then
    if previous.payload_hash<>payload_hash then raise exception 'Request key changed' using errcode='PT409'; end if;
    select p.* into child from public.tn_packs p join public.tn_pack_versions v on v.pack_id=p.id
      where v.id=previous.version_id and p.owner_id=caller;
    if not found then raise exception 'Merge unavailable' using errcode='PT404'; end if;
    return jsonb_build_object('pack_id',child.id,'version_id',previous.version_id,'copied_evidence',previous.copied_evidence,'reused',true);
  end if;
  -- Ordered exclusive locks also serialize all evidence SHARE locks and visibility.
  for pack_row in select p.* from public.tn_packs p
    where p.id in (select pack_id from public.tn_pack_versions where id=any(version_ids))
      and (p.is_public or p.owner_id=caller) order by p.id for update loop
    visible_count:=visible_count+1;
  end loop;
  if visible_count<>2 then raise exception 'Parents unavailable or not distinct' using errcode='PT404'; end if;
  for item in select * from jsonb_array_elements(parents) loop
    select * into selected from public.tn_pack_versions where id=(item->>'version_id')::uuid;
    if selected.content_hash is distinct from item->>'content_hash'
      or selected.evidence_revision is distinct from (item->>'evidence_revision')::bigint
      or (select trust_visibility_epoch from public.tn_packs where id=selected.pack_id) is distinct from (item->>'visibility_epoch')::bigint then
      raise exception 'Merge inputs changed' using errcode='PT409'; end if;
    if selected.snapshot->>'schema_version'<>'seed-template-v1' or selected.snapshot->>'policy_version'<>'accepted-edges-v1' then
      raise exception 'Unsupported template' using errcode='22023'; end if;
  end loop;
  select * into metadata from public.tn_pack_versions where id=(p_input->>'metadata_version')::uuid and id=any(version_ids);
  if not found then raise exception 'Choose category and metadata parent' using errcode='22023'; end if;
  if jsonb_array_length(p_input->'entries') not between 1 and 50 then raise exception 'Choose 1 to 50 members' using errcode='22023'; end if;
  for item in select * from jsonb_array_elements(p_input->'entries') loop
    if jsonb_typeof(item->'is_seed') is distinct from 'boolean' or jsonb_typeof(item->'rationale') is distinct from 'string'
      or length(item->>'rationale')>1000 then raise exception 'Reconcile each seed and rationale' using errcode='22023'; end if;
    select e into source_entry from public.tn_pack_versions v cross join jsonb_array_elements(v.snapshot->'entries') e
      where v.id=(item->>'metadata_version')::uuid and v.id=any(version_ids) and e->>'source_id'=item->>'source_id';
    if source_entry is null or exists(select 1 from jsonb_array_elements(entries) e where e->>'source_id'=item->>'source_id') then
      raise exception 'Choose distinct members from selected parents' using errcode='22023'; end if;
    if (item->>'is_seed')::boolean and (coalesce(source_entry->>'site_id','')='' or source_entry->>'status'<>'ready'
      or length(btrim(item->>'rationale'))=0) then raise exception 'Seeds need ready sites and rationale' using errcode='22023'; end if;
    if not (item->>'is_seed')::boolean and item->>'rationale'<>'' then raise exception 'Only seeds have seed rationale' using errcode='22023'; end if;
    ordinal:=ordinal+1;
    entries:=entries||jsonb_build_array(source_entry||jsonb_build_object('rank',ordinal,'is_seed',(item->>'is_seed')::boolean,'rationale',btrim(item->>'rationale')));
  end loop;
  if not exists(select 1 from jsonb_array_elements(entries) e where (e->>'is_seed')::boolean) then raise exception 'Choose seeds explicitly' using errcode='22023'; end if;
  perform s.id from public.tn_sources s where s.id in (select (e->>'source_id')::uuid from jsonb_array_elements(entries) e) order by s.id for share;
  if exists(select 1 from jsonb_array_elements(entries) e where not exists(select 1 from public.tn_sources s where s.id=(e->>'source_id')::uuid and s.kind='link')) then
    raise exception 'A selected member is unavailable' using errcode='PT409'; end if;
  if (p_input->>'copy_evidence')::boolean then
    select count(*),coalesce(sum(octet_length(r.body::text)),0) into count_edges,evidence_bytes
    from public.tn_source_edges e cross join lateral (select body from public.tn_edge_revisions where edge_id=e.id order by revision desc limit 1) r
    where e.template_version_id=any(version_ids);
    if count_edges>200 or evidence_bytes>2097152 then raise exception 'Evidence copy exceeds limits' using errcode='PT422'; end if;
  end if;
  child_id:=public.tn_create_pack(btrim(p_input->>'title'),metadata.snapshot->>'description',metadata.snapshot->>'category',
    array(select jsonb_array_elements_text(metadata.snapshot->'tags')),false,entries);
  select * into child from public.tn_packs where id=child_id;
  snapshot:=metadata.snapshot||jsonb_build_object('title',child.title,'owner_id',caller,'pack_revision',child.revision,
    'category_id',child.category_id,'category_key',child.category_key,'seed_mode',p_input->>'seed_mode','entries',entries);
  insert into public.tn_pack_versions(pack_id,pack_revision,snapshot,content_hash)
    values(child.id,child.revision,snapshot,encode(sha256(convert_to(snapshot::text,'UTF8')),'hex')) returning id into child_version;
  insert into public.tn_pack_origins(pack_id,parent_id,parent_revision)
    select child.id,pack_id,pack_revision from public.tn_pack_versions where id=any(version_ids);
  insert into public.tn_template_origins(version_id,parent_version_id,parent_evidence_revision)
    select child_version,id,evidence_revision from public.tn_pack_versions where id=any(version_ids);
  if (p_input->>'copy_evidence')::boolean then
    for evidence in select r.* from public.tn_source_edges e cross join lateral (
      select * from public.tn_edge_revisions where edge_id=e.id order by revision desc limit 1) r
      where e.template_version_id=any(version_ids) order by e.template_version_id,e.id loop
      select e into source_meta from jsonb_array_elements(entries) e where e->>'source_id'=evidence.body->>'source_id';
      select e into target_meta from jsonb_array_elements(entries) e where e->>'source_id'=evidence.body->>'target_id';
      if source_meta is null or target_meta is null then continue; end if;
      normalized:=evidence.body||jsonb_build_object('origin','template-import','source_url',source_meta->'url','target_url',target_meta->'url',
        'source_site_id',source_meta->'site_id','target_site_id',target_meta->'site_id');
      fingerprint:=encode(sha256(convert_to(normalized::text,'UTF8')),'hex');
      if not copied_map ? fingerprint then
        insert into public.tn_source_edges(template_version_id,author_id,creation_kind) values(child_version,caller,'template-import') returning id into child_edge;
        insert into public.tn_edge_revisions(edge_id,revision,body) values(child_edge,1,normalized) returning id into child_revision;
        copied_map:=copied_map||jsonb_build_object(fingerprint,jsonb_build_array(child_edge,child_revision)); copied:=copied+1;
      else
        child_edge:=(copied_map->fingerprint->>0)::uuid; child_revision:=(copied_map->fingerprint->>1)::uuid;
      end if;
      insert into public.tn_edge_origins(edge_id,imported_revision_id,parent_revision_id) values(child_edge,child_revision,evidence.id);
    end loop;
  end if;
  insert into public.tn_template_merge_requests(requester_id,request_key,payload_hash,version_id,copied_evidence)
    values(caller,merge_key,payload_hash,child_version,copied);
  return jsonb_build_object('pack_id',child.id,'version_id',child_version,'copied_evidence',copied,'reused',false);
end $$;
revoke all on function public.tn_template_merge_info(uuid),public.tn_merge_templates(jsonb) from public,anon,authenticated;
grant execute on function public.tn_template_merge_info(uuid) to anon,authenticated;
grant execute on function public.tn_merge_templates(jsonb) to authenticated;
commit;
