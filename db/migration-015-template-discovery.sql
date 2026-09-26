-- Run after 014. Read-only discovery: caller RLS applies before pagination.
begin;
create index tn_template_discovery_order on public.tn_pack_versions(created_at desc,id desc);
create index tn_template_discovery_category on public.tn_pack_versions((snapshot->>'category_key'),created_at desc,id desc);

create function public.tn_discover_templates(p_category text default null,
  p_before_time timestamptz default null,p_before_id uuid default null,p_limit integer default 12)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare category_filter text; result jsonb;
begin
  if p_limit is null or p_limit not between 1 and 25
    or (p_before_time is null) <> (p_before_id is null)
    or (p_before_time is not null and not isfinite(p_before_time)) then
    raise exception 'Invalid discovery page' using errcode='22023';
  end if;
  if p_category is not null then
    category_filter:=lower(public.tn_category_path(p_category));
    if category_filter is null or length(category_filter) not between 1 and 80 then
      raise exception 'Invalid category path' using errcode='22023';
    end if;
  end if;
  with candidates as materialized (
    select v.id,v.created_at from public.tn_pack_versions v join public.tn_packs p on p.id=v.pack_id
    where (category_filter is null or v.snapshot->>'category_key'=category_filter
      or starts_with(v.snapshot->>'category_key',category_filter||' > '))
      and (p_before_time is null or (v.created_at,v.id)<(p_before_time,p_before_id))
    order by v.created_at desc,v.id desc limit p_limit+1
  ), page as materialized (
    select v.*,p.owner_id,p.is_public,p.revision as current_revision,p.trust_visibility_epoch
    from (select * from candidates order by created_at desc,id desc limit p_limit) c
    join public.tn_pack_versions v on v.id=c.id join public.tn_packs p on p.id=v.pack_id
  ), public_packs as materialized (
    -- Same bounded scope as retrieval-v1, with deterministic time/ID ties.
    select id,owner_id from public.tn_packs where is_public and owner_id is not null
    order by created_at desc,id desc limit 200
  ), public_references as materialized (
    select p.id as pack_id,p.owner_id,ps.rank,s.url from public_packs p
    join public.tn_pack_sources ps on ps.pack_id=p.id join public.tn_sources s on s.id=ps.source_id
  ), cards as (
    select v.created_at,v.id,jsonb_build_object(
      'id',v.id,'pack_id',v.pack_id,'pack_revision',v.pack_revision,'created_at',v.created_at,
      'content_hash',v.content_hash,'owner_id',v.owner_id,'is_public',v.is_public,
      'title',v.snapshot->'title','description',v.snapshot->'description',
      'category',v.snapshot->'category','category_id',v.snapshot->'category_id',
      'category_key',v.snapshot->'category_key','seed_mode',v.snapshot->'seed_mode',
      'schema_version',v.snapshot->'schema_version','policy_version',v.snapshot->'policy_version',
      'members',(select jsonb_agg(jsonb_build_object(
        'source_id',e->'source_id','title',e->'title','url',e->'url','site_id',e->'site_id',
        'rank',e->'rank','is_seed',e->'is_seed','rationale',e->'rationale',
        'adoption',jsonb_build_object('curators',a.curators,'pack_count',a.pack_count,
          'reciprocal_rank_sum',a.raw,'value',least(2,a.raw))) order by (e->>'rank')::integer)
        from jsonb_array_elements(v.snapshot->'entries') e
        cross join lateral (select count(*) as curators,coalesce(sum(packs),0) as pack_count,
          round(coalesce(sum(best),0),4) as raw from (
            select owner_id,count(distinct pack_id) as packs,max(1.0/rank) as best
            from public_references where url=e->>'url' group by owner_id
          ) per_curator) a),
      'origins',coalesce((select jsonb_agg(jsonb_build_object('version_id',pv.id,'pack_id',pp.id,
        'title',pv.snapshot->'title','owner_id',pp.owner_id,'pack_revision',pv.pack_revision)
        order by pv.id) from public.tn_template_origins o
        join public.tn_pack_versions pv on pv.id=o.parent_version_id
        join public.tn_packs pp on pp.id=pv.pack_id where o.version_id=v.id),'[]'::jsonb),
      'run',(select jsonb_build_object('id',r.id,'completed_at',r.completed_at,
        'methodology',s.input_text::jsonb->'algorithm'->'methodology',
        'public_readable',s.captured_public and v.is_public and s.visibility_epoch=v.trust_visibility_epoch
          and exists(select 1 from public.tn_policy_publications pub where pub.run_id=r.id),
        'stale',s.pack_revision<>v.current_revision or s.evidence_revision<>v.evidence_revision
          or s.visibility_epoch<>v.trust_visibility_epoch,
        'site_evidence_state',r.raw_result->'results'->'site'->'evidence_state',
        'resource_evidence_state',r.raw_result->'results'->'resource'->'evidence_state')
        from public.tn_trust_runs r join public.tn_graph_snapshots s on s.id=r.snapshot_id
        where s.template_version_id=v.id and r.state='completed'
        order by (s.captured_public and v.is_public and s.visibility_epoch=v.trust_visibility_epoch
          and exists(select 1 from public.tn_policy_publications pub where pub.run_id=r.id)) desc,
          r.created_at desc,r.id desc limit 1)
    ) as card from page v
  ) select jsonb_build_object('templates',coalesce((select jsonb_agg(card order by created_at desc,id desc) from cards),'[]'::jsonb),
    'next',case when (select count(*) from candidates)>p_limit then
      (select jsonb_build_object('created_at',created_at,'id',id) from page order by created_at,id limit 1) else null end,
    'adoption_scope',jsonb_build_object('method','retrieval-v1','public_pack_limit',200,
      'public_packs_considered',(select count(*) from public_packs))) into result;
  return result;
end $$;
revoke all on function public.tn_discover_templates(text,timestamptz,uuid,integer) from public,anon,authenticated;
grant execute on function public.tn_discover_templates(text,timestamptz,uuid,integer) to anon,authenticated;
notify pgrst,'reload schema';
commit;
