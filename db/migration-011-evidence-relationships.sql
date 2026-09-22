-- Run after 010. Attributable manual evidence, scoped to immutable templates.
begin;
create table public.tn_source_edges (
  id uuid primary key default gen_random_uuid(),
  template_version_id uuid not null references public.tn_pack_versions(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index tn_source_edges_template on public.tn_source_edges(template_version_id,created_at desc,id);
create table public.tn_edge_revisions (
  id uuid primary key default gen_random_uuid(),
  edge_id uuid not null references public.tn_source_edges(id) on delete cascade,
  revision integer not null check(revision>0),
  previous_revision_id uuid references public.tn_edge_revisions(id),
  body jsonb not null,
  created_at timestamptz not null default now(),
  unique(edge_id,revision)
);
create table public.tn_edge_reviews (
  id bigint generated always as identity primary key,
  revision_id uuid not null references public.tn_edge_revisions(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  action text not null check(action in ('accept','reject','withdraw','challenge','uphold','dismiss')),
  reason text not null check(length(btrim(reason)) between 1 and 2000),
  locator text not null default '' check(length(locator)<=1000),
  excerpt text not null default '' check(length(excerpt)<=2000),
  challenge_id bigint references public.tn_edge_reviews(id),
  evidence_reviewed boolean not null default false,
  created_at timestamptz not null default now()
);
create index tn_edge_reviews_revision on public.tn_edge_reviews(revision_id,id desc);
create unique index tn_edge_challenge_resolution on public.tn_edge_reviews(challenge_id) where challenge_id is not null;

alter table public.tn_source_edges enable row level security;
alter table public.tn_edge_revisions enable row level security;
alter table public.tn_edge_reviews enable row level security;
revoke all on public.tn_source_edges,public.tn_edge_revisions,public.tn_edge_reviews from public,anon,authenticated;
revoke all on sequence public.tn_edge_reviews_id_seq from public,anon,authenticated;
grant select on public.tn_source_edges,public.tn_edge_revisions,public.tn_edge_reviews to anon,authenticated;
create policy "visible template evidence" on public.tn_source_edges for select using (
  exists(select 1 from public.tn_pack_versions v where v.id=template_version_id)
);
create policy "visible evidence revisions" on public.tn_edge_revisions for select using (
  exists(select 1 from public.tn_source_edges e where e.id=edge_id)
);
create policy "visible evidence reviews" on public.tn_edge_reviews for select using (
  exists(select 1 from public.tn_edge_revisions r where r.id=revision_id)
);

-- Internal helper: lock current visibility during a mutation. No caller grant.
create function public.tn_evidence_template(p_version uuid,p_owner boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select v.snapshot into snapshot from public.tn_pack_versions v join public.tn_packs p on p.id=v.pack_id
    where v.id=p_version and (p.owner_id=auth.uid() or (not p_owner and p.is_public)) for share of p;
  if not found then raise exception 'Template unavailable' using errcode='PT404'; end if;
  return snapshot;
end $$;
revoke all on function public.tn_evidence_template(uuid,boolean) from public,anon,authenticated;

create function public.tn_save_relationship(p_version uuid,p_edge uuid,p_previous uuid,p_body jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare template jsonb; source jsonb; target jsonb; edge public.tn_source_edges;
  previous public.tn_edge_revisions; saved public.tn_edge_revisions; key text; value text;
begin
  template := public.tn_evidence_template(p_version,false);
  if jsonb_typeof(p_body) is distinct from 'object' then raise exception 'Invalid evidence' using errcode='22023'; end if;
  for key,value in select * from jsonb_each_text(p_body) loop
    if key not in ('source_id','target_id','relation','claim_scope','rationale','source_locator','source_quote','target_locator','target_quote','observed_on')
      or jsonb_typeof(p_body->key) is distinct from 'string' or length(value)>2000 then
      raise exception 'Invalid evidence field' using errcode='22023';
    end if;
  end loop;
  if coalesce(p_body->>'relation','') not in ('cites','corroborates','contradicts','supersedes')
    or coalesce(length(btrim(p_body->>'rationale')),0) not between 1 and 2000
    or coalesce(length(btrim(p_body->>'source_locator')),0) not between 1 and 1000
    or coalesce(p_body->>'observed_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    or (p_body->>'relation'<>'cites' and (coalesce(length(btrim(p_body->>'claim_scope')),0) not between 1 and 1000
      or coalesce(length(btrim(p_body->>'target_locator')),0) not between 1 and 1000)) then
    raise exception 'Supply scope, evidence and observation date' using errcode='22023';
  end if;
  perform (p_body->>'observed_on')::date;
  select entry into source from jsonb_array_elements(template->'entries') entry where entry->>'source_id'=p_body->>'source_id';
  select entry into target from jsonb_array_elements(template->'entries') entry where entry->>'source_id'=p_body->>'target_id';
  if source is null or target is null or source->>'source_id'=target->>'source_id' then
    raise exception 'Choose two different template members' using errcode='22023';
  end if;
  if p_edge is null then
    if p_previous is not null then raise exception 'Unexpected previous revision' using errcode='22023'; end if;
    insert into public.tn_source_edges(template_version_id,author_id) values(p_version,auth.uid()) returning * into edge;
  else
    select * into edge from public.tn_source_edges where id=p_edge and template_version_id=p_version and author_id=auth.uid() for update;
    if not found then raise exception 'Relationship unavailable' using errcode='PT404'; end if;
    select * into previous from public.tn_edge_revisions where edge_id=p_edge order by revision desc limit 1;
    if p_previous is distinct from previous.id then raise exception 'Evidence changed' using errcode='PT409'; end if;
  end if;
  -- URLs/site identities come from the immutable template, never the proposal.
  insert into public.tn_edge_revisions(edge_id,revision,previous_revision_id,body)
    values(edge.id,coalesce(previous.revision,0)+1,previous.id,p_body || jsonb_build_object(
      'origin','manual-proposal','source_url',source->>'url','target_url',target->>'url',
      'source_site_id',source->>'site_id','target_site_id',target->>'site_id')) returning * into saved;
  return jsonb_build_object('edge_id',edge.id,'revision_id',saved.id,'revision',saved.revision);
end $$;
revoke all on function public.tn_save_relationship(uuid,uuid,uuid,jsonb) from public,anon;
grant execute on function public.tn_save_relationship(uuid,uuid,uuid,jsonb) to authenticated;

-- Reviews are events: challenges/resolutions never silently change acceptance.
create function public.tn_review_relationship(p_revision uuid,p_action text,p_reason text,
  p_expected_decision bigint,p_evidence_reviewed boolean,p_locator text,p_excerpt text,p_challenge bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare revision public.tn_edge_revisions; edge public.tn_source_edges;
  latest uuid; decision bigint; saved bigint; challenge public.tn_edge_reviews;
begin
  select * into revision from public.tn_edge_revisions where id=p_revision;
  select * into edge from public.tn_source_edges where id=revision.edge_id;
  -- Check visibility before disclosing record state or taking the edge lock.
  perform public.tn_evidence_template(edge.template_version_id,p_action is distinct from 'challenge');
  perform 1 from public.tn_source_edges where id=edge.id for update;
  if p_action is null or p_action not in ('accept','reject','withdraw','challenge','uphold','dismiss')
    or coalesce(length(btrim(p_reason)),0) not between 1 and 2000 then
    raise exception 'Supply review action and rationale' using errcode='22023';
  end if;
  if p_action in ('accept','reject','withdraw') then
    select r.id into latest from public.tn_edge_revisions r where r.edge_id=edge.id order by r.revision desc limit 1;
    select id into decision from public.tn_edge_reviews where revision_id=p_revision and action in ('accept','reject','withdraw') order by id desc limit 1;
    if latest<>p_revision or p_expected_decision is distinct from decision then
      raise exception 'Evidence or decision changed' using errcode='PT409';
    end if;
    if p_action='accept' and (p_evidence_reviewed is distinct from true
      or coalesce(length(btrim(revision.body->>'source_quote')),0)=0
      or (revision.body->>'relation'<>'cites' and coalesce(length(btrim(revision.body->>'target_quote')),0)=0)) then
      raise exception 'Review captured evidence before accepting' using errcode='22023';
    end if;
  elsif p_action='challenge' then
    if coalesce(length(btrim(p_locator)),0) not between 1 and 1000
      or coalesce(length(btrim(p_excerpt)),0) not between 1 and 2000 then
      raise exception 'Supply challenge evidence' using errcode='22023';
    end if;
  else
    select * into challenge from public.tn_edge_reviews where id=p_challenge and revision_id=p_revision and action='challenge';
    if not found then raise exception 'Challenge unavailable' using errcode='PT404'; end if;
    if exists(select 1 from public.tn_edge_reviews where challenge_id=p_challenge) then
      raise exception 'Challenge already resolved' using errcode='PT409';
    end if;
  end if;
  insert into public.tn_edge_reviews(revision_id,author_id,action,reason,locator,excerpt,challenge_id,evidence_reviewed)
    values(p_revision,auth.uid(),p_action,btrim(p_reason),
      case when p_action='challenge' then btrim(p_locator) else '' end,
      case when p_action='challenge' then btrim(p_excerpt) else '' end,
      case when p_action in ('uphold','dismiss') then p_challenge end,p_action='accept') returning id into saved;
  return jsonb_build_object('id',saved,'action',p_action);
end $$;
revoke all on function public.tn_review_relationship(uuid,text,text,bigint,boolean,text,text,bigint) from public,anon;
grant execute on function public.tn_review_relationship(uuid,text,text,bigint,boolean,text,text,bigint) to authenticated;

-- Bounded summary reads run under caller RLS, including nested decisions.
create function public.tn_list_relationships(p_version uuid,p_offset integer default 0) returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce(jsonb_agg(to_jsonb(summary) order by summary.created_at desc,summary.id),'[]'::jsonb)
  from (
    select e.*,to_jsonb(r) as current_revision,to_jsonb(d) as current_decision
    from (select * from public.tn_source_edges where template_version_id=p_version
      order by created_at desc,id limit 20 offset greatest(0,least(coalesce(p_offset,0),10000))) e
    cross join lateral (select * from public.tn_edge_revisions where edge_id=e.id order by revision desc limit 1) r
    left join lateral (select * from public.tn_edge_reviews where revision_id=r.id and action in ('accept','reject','withdraw') order by id desc limit 1) d on true
  ) summary
$$;
revoke all on function public.tn_list_relationships(uuid,integer) from public,anon,authenticated;
grant execute on function public.tn_list_relationships(uuid,integer) to anon,authenticated;
commit;
