-- Run after 015. No new scoring authority: read existing completed site masses.
begin;
create function public.tn_template_reference_scope(p_run uuid,p_category text default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare ref_run public.tn_trust_runs; ref_snapshot public.tn_graph_snapshots;
  ref_pack public.tn_packs; ref_version public.tn_pack_versions; input jsonb;
  category_filter text; candidates jsonb; has_more boolean;
begin
  select * into ref_run from public.tn_trust_runs where id=p_run;
  if not found then raise exception 'Reference unavailable' using errcode='PT404'; end if;
  if ref_run.state<>'completed' then raise exception 'Reference incomplete' using errcode='PT409'; end if;
  select * into ref_snapshot from public.tn_graph_snapshots where id=ref_run.snapshot_id;
  select * into ref_pack from public.tn_packs where id=ref_snapshot.pack_id;
  select * into ref_version from public.tn_pack_versions where id=ref_snapshot.template_version_id;
  input:=ref_snapshot.input_text::jsonb;
  if p_category is not null then
    category_filter:=lower(public.tn_category_path(p_category));
    if category_filter is null or length(category_filter) not between 1 and 80 then
      raise exception 'Invalid category' using errcode='22023';
    end if;
  end if;
  with visible as materialized (
    select v.id,v.created_at from public.tn_pack_versions v join public.tn_packs p on p.id=v.pack_id
    where v.pack_id<>ref_pack.id and (category_filter is null or v.snapshot->>'category_key'=category_filter
      or starts_with(v.snapshot->>'category_key',category_filter||' > '))
    order by v.created_at desc,v.id desc limit 51
  ), cohort as (select * from visible order by created_at desc,id desc limit 50)
  select coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'pack_id',v.pack_id,
      'content_hash',v.content_hash,'pack_revision',v.pack_revision,'created_at',v.created_at,
      'title',v.snapshot->'title','owner_id',p.owner_id,'is_public',p.is_public,'visibility_epoch',p.trust_visibility_epoch,
      'category',v.snapshot->'category','category_id',v.snapshot->'category_id',
      'policy_version',v.snapshot->'policy_version','seed_mode',v.snapshot->'seed_mode',
      'site_ids',(select coalesce(jsonb_agg(site_id order by site_id),'[]'::jsonb) from (
        select distinct e->>'site_id' as site_id from jsonb_array_elements(v.snapshot->'entries') e
        where e->>'site_id' is not null) sites),
      'unmapped_resources',(select count(*) from jsonb_array_elements(v.snapshot->'entries') e where e->>'site_id' is null))
      order by v.created_at desc,v.id desc)
    from cohort c join public.tn_pack_versions v on v.id=c.id join public.tn_packs p on p.id=v.pack_id),'[]'::jsonb),
    (select count(*)>50 from visible) into candidates,has_more;
  return jsonb_build_object('reference',jsonb_build_object('run_id',ref_run.id,
    'input_hash',ref_snapshot.input_hash,'output_hash',ref_run.output_hash,
    'template_version_id',ref_version.id,'pack_id',ref_pack.id,
    'category',input->'template'->'snapshot'->'category','category_id',input->'template'->'snapshot'->'category_id',
    'policy_version',input->'template'->'snapshot'->'policy_version','algorithm',input->'algorithm',
    'completed_at',ref_run.completed_at,'visibility_epoch',ref_pack.trust_visibility_epoch,
    'site_evidence_state',ref_run.raw_result->'results'->'site'->'evidence_state',
    'stale',ref_pack.revision<>ref_snapshot.pack_revision or ref_version.evidence_revision<>ref_snapshot.evidence_revision
      or ref_pack.trust_visibility_epoch<>ref_snapshot.visibility_epoch,
    'public_readable',ref_snapshot.captured_public and ref_pack.is_public
      and ref_pack.trust_visibility_epoch=ref_snapshot.visibility_epoch
      and exists(select 1 from public.tn_policy_publications where run_id=p_run)),
    'site_scores',(select coalesce(jsonb_agg(jsonb_build_object('id',node_id,'mass',mass) order by node_id),'[]'::jsonb)
      from public.tn_trust_scores where run_id=p_run and projection='site'),
    'templates',candidates,'has_more',has_more);
end $$;
revoke all on function public.tn_template_reference_scope(uuid,text) from public,anon,authenticated;
grant execute on function public.tn_template_reference_scope(uuid,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
