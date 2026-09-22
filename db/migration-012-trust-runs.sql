-- Run after 011. Local worker milestone: additive, no privileged app key.
begin;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='tn_graph_worker') then
    create role tn_graph_worker nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
  end if;
end $$;
grant usage on schema public to tn_graph_worker;

alter table public.tn_pack_versions add column evidence_revision bigint not null default 1;
alter table public.tn_packs add column trust_visibility_epoch bigint not null default 1;
create function public.tn_graph_visibility_epoch() returns trigger language plpgsql as $$
begin
  new.trust_visibility_epoch := old.trust_visibility_epoch + case when new.is_public is distinct from old.is_public then 1 else 0 end;
  return new;
end $$;
create trigger tn_graph_visibility before update on public.tn_packs for each row execute function public.tn_graph_visibility_epoch();
create function public.tn_graph_evidence_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare version uuid;
begin
  if tg_table_name='tn_edge_revisions' then
    select template_version_id into version from public.tn_source_edges where id=new.edge_id;
  else
    select e.template_version_id into version from public.tn_edge_revisions r join public.tn_source_edges e on e.id=r.edge_id where r.id=new.revision_id;
  end if;
  update public.tn_pack_versions set evidence_revision=evidence_revision+1 where id=version;
  return new;
end $$;
create trigger tn_graph_revision_changed after insert on public.tn_edge_revisions for each row execute function public.tn_graph_evidence_changed();
create trigger tn_graph_review_changed after insert on public.tn_edge_reviews for each row execute function public.tn_graph_evidence_changed();

create table public.tn_graph_snapshots (
  id uuid primary key default gen_random_uuid(),
  template_version_id uuid not null references public.tn_pack_versions(id) on delete cascade,
  pack_id uuid not null references public.tn_packs(id) on delete cascade,
  pack_revision integer not null, evidence_revision bigint not null,
  visibility_epoch bigint not null, captured_public boolean not null,
  input_text text not null check(octet_length(input_text)<=2097152),
  input_hash text not null check(input_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique(template_version_id,input_hash)
);
create table public.tn_trust_runs (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references public.tn_graph_snapshots(id) on delete cascade,
  requester_id uuid not null references auth.users(id) on delete cascade,
  request_key uuid not null,
  state text not null default 'queued' check(state in ('queued','running','completed','failed')),
  failure_code text check(failure_code in ('invalid_graph','not_converged','worker_error','lease_expired','invalid_result')),
  failure_diagnostics jsonb check(failure_diagnostics is null or (jsonb_typeof(failure_diagnostics)='object' and octet_length(failure_diagnostics::text)<=8192)),
  raw_result jsonb, canonical_output text, output_hash text,
  created_at timestamptz not null default now(), completed_at timestamptz,
  unique(requester_id,request_key),
  check((state='completed') = (raw_result is not null and canonical_output is not null and output_hash is not null and completed_at is not null)),
  check(raw_result is null or octet_length(raw_result::text)<=2097152),
  check(canonical_output is null or octet_length(canonical_output)<=2097152)
);
create table public.tn_trust_requests (
  requester_id uuid not null references auth.users(id) on delete cascade,
  request_key uuid not null, run_id uuid not null references public.tn_trust_runs(id) on delete cascade,
  primary key(requester_id,request_key)
);
alter table public.tn_trust_requests enable row level security;
revoke all on public.tn_trust_requests from public,anon,authenticated,tn_graph_worker;
create table public.tn_jobs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.tn_trust_runs(id) on delete cascade,
  snapshot_id uuid not null references public.tn_graph_snapshots(id) on delete cascade,
  state text not null default 'queued' check(state in ('queued','leased','completed','failed')),
  attempts integer not null default 0 check(attempts between 0 and 3),
  lease_token uuid, lease_owner name, lease_until timestamptz,
  created_at timestamptz not null default now()
);
create unique index tn_graph_one_active_job on public.tn_jobs(snapshot_id) where state in ('queued','leased');
create index tn_graph_job_queue on public.tn_jobs(created_at,id) where state in ('queued','leased');
create table public.tn_trust_scores (
  run_id uuid not null references public.tn_trust_runs(id) on delete cascade,
  projection text not null check(projection in ('site','resource')),
  node_id uuid not null, mass double precision not null check(mass>=0 and mass<=1),
  score jsonb not null,
  primary key(run_id,projection,node_id)
);
create table public.tn_graph_worker_health (
  singleton boolean primary key default true check(singleton), last_seen timestamptz not null
);
alter table public.tn_graph_worker_health enable row level security;
revoke all on public.tn_graph_worker_health from public,anon,authenticated,tn_graph_worker;
create table public.tn_policy_publications (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.tn_trust_runs(id) on delete cascade,
  published_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create function public.tn_graph_config() returns jsonb language sql immutable as $$
select '{"methodology":"graph-trust-v1","implementation":"graph-trust-v1.0.0","damping":0.85,"tolerance":0.000001,"max_iterations":100,"max_nodes":1000,"max_edges":10000,"max_relationships":10000,"canonical_decimals":12}'::jsonb
$$;

-- A run requester can read their work only while its template remains accessible.
-- Public reads require explicit publication and uninterrupted public visibility.
create function public.tn_can_read_trust_run(p_run uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.tn_trust_runs r
    join public.tn_graph_snapshots s on s.id=r.snapshot_id join public.tn_packs p on p.id=s.pack_id
    where r.id=p_run and (
      (r.requester_id=auth.uid() and (p.owner_id=auth.uid() or (p.is_public and p.trust_visibility_epoch=s.visibility_epoch)))
      or (r.state='completed' and s.captured_public and p.is_public and p.trust_visibility_epoch=s.visibility_epoch
        and exists(select 1 from public.tn_policy_publications pub where pub.run_id=r.id))))
$$;

alter table public.tn_graph_snapshots enable row level security;
alter table public.tn_trust_runs enable row level security;
alter table public.tn_jobs enable row level security;
alter table public.tn_trust_scores enable row level security;
alter table public.tn_policy_publications enable row level security;
revoke all on public.tn_graph_snapshots,public.tn_trust_runs,public.tn_jobs,public.tn_trust_scores,public.tn_policy_publications from public,anon,authenticated,tn_graph_worker;
grant select on public.tn_graph_snapshots,public.tn_trust_runs,public.tn_trust_scores,public.tn_policy_publications to anon,authenticated;
create policy "read available runs" on public.tn_trust_runs for select using(public.tn_can_read_trust_run(id));
create policy "read available snapshots" on public.tn_graph_snapshots for select using(exists(select 1 from public.tn_trust_runs r where r.snapshot_id=tn_graph_snapshots.id and public.tn_can_read_trust_run(r.id)));
create policy "read available scores" on public.tn_trust_scores for select using(public.tn_can_read_trust_run(run_id));
create policy "read available publications" on public.tn_policy_publications for select using(public.tn_can_read_trust_run(run_id));

create function public.tn_enqueue_trust_run(p_version uuid,p_pack_revision integer,p_evidence_revision bigint,p_request_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); version public.tn_pack_versions; pack public.tn_packs;
  existing public.tn_trust_runs; frozen public.tn_graph_snapshots; job public.tn_jobs;
  relations jsonb; reviews jsonb; payload jsonb; input text; fingerprint text; count_edges integer; evidence_bytes bigint; review_count bigint; review_bytes bigint;
begin
  if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_request_key is null or p_pack_revision is null or p_evidence_revision is null then raise exception 'Expected revisions required' using errcode='22023'; end if;
  -- Serialize account quota checks, including captures of different templates.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(caller::text,12));
  select p.* into pack from public.tn_packs p join public.tn_pack_versions v on v.pack_id=p.id
    where v.id=p_version and (p.owner_id=caller or p.is_public) for update of p;
  if not found then raise exception 'Template unavailable' using errcode='PT404'; end if;
  select * into version from public.tn_pack_versions where id=p_version;
  select r.* into existing from public.tn_trust_runs r join public.tn_trust_requests q on q.run_id=r.id where q.requester_id=caller and q.request_key=p_request_key;
  if found then
    select * into frozen from public.tn_graph_snapshots where id=existing.snapshot_id;
    if frozen.template_version_id<>p_version or frozen.pack_revision<>p_pack_revision or frozen.evidence_revision<>p_evidence_revision
      or (pack.owner_id<>caller and frozen.visibility_epoch<>pack.trust_visibility_epoch) then
      raise exception 'Request key reused with different input' using errcode='PT409'; end if;
    return jsonb_build_object('run_id',existing.id,'state',existing.state,'reused',true);
  end if;
  if pack.revision<>p_pack_revision or version.evidence_revision<>p_evidence_revision then
    raise exception 'Template or evidence changed' using errcode='PT409'; end if;
  if version.snapshot->>'schema_version'<>'seed-template-v1' or version.snapshot->>'policy_version'<>'accepted-edges-v1'
    or jsonb_array_length(version.snapshot->'entries') not between 1 and 1000 then
    raise exception 'Unsupported or oversized template' using errcode='PT422'; end if;
  select count(*) into count_edges from public.tn_source_edges where template_version_id=p_version;
  if count_edges>10000 then raise exception 'Too many relationships' using errcode='PT422'; end if;
  select coalesce(sum(octet_length(to_jsonb(r)::text)+octet_length(to_jsonb(e)::text)),0) into evidence_bytes
    from public.tn_source_edges e cross join lateral (select * from public.tn_edge_revisions where edge_id=e.id order by revision desc limit 1) r
    where e.template_version_id=p_version;
  select count(*),coalesce(sum(octet_length(to_jsonb(d)::text)),0) into review_count,review_bytes
    from public.tn_edge_reviews d join public.tn_edge_revisions r on r.id=d.revision_id
    join public.tn_source_edges e on e.id=r.edge_id where e.template_version_id=p_version;
  if review_count>20000 or evidence_bytes+review_bytes+octet_length(to_jsonb(version)::text)>2097152 then
    raise exception 'Evidence exceeds snapshot bounds' using errcode='PT422'; end if;
  -- Existing evidence mutations hold SHARE on this same pack until commit. The
  -- UPDATE lock above freezes revisions, reviews and visibility for this capture.
  select coalesce(jsonb_agg(to_jsonb(summary) order by summary.id),'[]') into relations from (
    select e.*,to_jsonb(r) as current_revision,to_jsonb(d) as current_decision
    from public.tn_source_edges e
    cross join lateral (select * from public.tn_edge_revisions where edge_id=e.id order by revision desc limit 1) r
    left join lateral (select * from public.tn_edge_reviews where revision_id=r.id and action in ('accept','reject','withdraw') order by id desc limit 1) d on true
    where e.template_version_id=p_version
  ) summary;
  select coalesce(jsonb_agg(to_jsonb(d) order by d.id),'[]') into reviews
    from public.tn_edge_reviews d join public.tn_edge_revisions r on r.id=d.revision_id
    join public.tn_source_edges e on e.id=r.edge_id where e.template_version_id=p_version;
  payload:=jsonb_build_object('schema_version','trust-snapshot-v1','template',to_jsonb(version),
    'relationships',relations,'reviews',reviews,'pack_revision',pack.revision,
    'visibility_epoch',pack.trust_visibility_epoch,'captured_public',pack.is_public,'algorithm',public.tn_graph_config());
  input:=payload::text;
  if octet_length(input)>2097152 then raise exception 'Snapshot exceeds byte limit' using errcode='PT422'; end if;
  fingerprint:=encode(sha256(convert_to(input,'UTF8')),'hex');
  select * into frozen from public.tn_graph_snapshots where template_version_id=p_version and input_hash=fingerprint;
  if found then
    select j.* into job from public.tn_jobs j where j.snapshot_id=frozen.id and j.state in ('queued','leased');
    if found then
      select * into existing from public.tn_trust_runs where id=job.run_id;
      -- Do not reveal another requester's unpublished job or private status.
      if existing.requester_id<>caller then raise exception 'This input is already queued' using errcode='PT429'; end if;
      insert into public.tn_trust_requests(requester_id,request_key,run_id) values(caller,p_request_key,existing.id);
      return jsonb_build_object('run_id',existing.id,'state',existing.state,'reused',true);
    end if;
  end if;
  if not exists(select 1 from public.tn_graph_worker_health where last_seen>clock_timestamp()-interval '2 minutes') then
    raise exception 'Worker unavailable' using errcode='PT503'; end if;
  if (select count(*) from public.tn_trust_runs where requester_id=caller and created_at>now()-interval '1 hour')>=10
    or (select count(*) from public.tn_trust_runs where requester_id=caller and state in ('queued','running'))>=2 then
    raise exception 'Compute quota exceeded' using errcode='PT429'; end if;
  if frozen.id is null then
    insert into public.tn_graph_snapshots(template_version_id,pack_id,pack_revision,evidence_revision,visibility_epoch,captured_public,input_text,input_hash)
      values(p_version,pack.id,pack.revision,version.evidence_revision,pack.trust_visibility_epoch,pack.is_public,input,fingerprint) returning * into frozen;
  end if;
  insert into public.tn_trust_runs(snapshot_id,requester_id,request_key) values(frozen.id,caller,p_request_key) returning * into existing;
  insert into public.tn_trust_requests(requester_id,request_key,run_id) values(caller,p_request_key,existing.id);
  insert into public.tn_jobs(run_id,snapshot_id) values(existing.id,frozen.id);
  return jsonb_build_object('run_id',existing.id,'state',existing.state,'reused',false);
end $$;

-- Worker-only queue operations. Login membership is provisioned separately; no
-- password or broad table privilege is created by this migration.
create function public.tn_lease_trust_job() returns jsonb language plpgsql security definer set search_path='' as $$
declare job public.tn_jobs; frozen public.tn_graph_snapshots;
begin
  insert into public.tn_graph_worker_health(singleton,last_seen) values(true,clock_timestamp())
    on conflict(singleton) do update set last_seen=excluded.last_seen;
  -- Terminal leases release the active-input slot; no partial result exists.
  with expired as (
    update public.tn_jobs set state='failed' where state='leased' and lease_until<clock_timestamp() and attempts>=3 returning run_id
  ) update public.tn_trust_runs set state='failed',failure_code='lease_expired' where id in(select run_id from expired);
  select * into job from public.tn_jobs where (state='queued' or (state='leased' and lease_until<clock_timestamp())) and attempts<3
    order by created_at,id for update skip locked limit 1;
  if not found then return null; end if;
  update public.tn_jobs set state='leased',attempts=attempts+1,lease_token=gen_random_uuid(),lease_owner=session_user,
    lease_until=clock_timestamp()+interval '60 seconds' where id=job.id returning * into job;
  update public.tn_trust_runs set state='running',failure_code=null,failure_diagnostics=null where id=job.run_id;
  select * into frozen from public.tn_graph_snapshots where id=job.snapshot_id;
  return jsonb_build_object('job_id',job.id,'run_id',job.run_id,'lease_token',job.lease_token,'lease_until',job.lease_until,
    'input_hash',frozen.input_hash,'input_text',frozen.input_text,'attempt',job.attempts);
end $$;

create function public.tn_fail_trust_job(p_job uuid,p_lease uuid,p_code text,p_retry boolean default false,p_diagnostics jsonb default null) returns void
language plpgsql security definer set search_path='' as $$
declare job public.tn_jobs; next_state text;
begin
  select * into job from public.tn_jobs where id=p_job for update;
  if not found or job.state<>'leased' or job.lease_token is distinct from p_lease or job.lease_owner is distinct from session_user
    or job.lease_until<=clock_timestamp() then raise exception 'Lease unavailable' using errcode='PT409'; end if;
  if p_code not in ('invalid_graph','not_converged','worker_error','invalid_result') or p_code is null then
    raise exception 'Invalid failure code' using errcode='22023'; end if;
  if p_diagnostics is not null and (p_code<>'not_converged' or jsonb_typeof(p_diagnostics)<>'object' or octet_length(p_diagnostics::text)>8192) then
    raise exception 'Invalid failure diagnostics' using errcode='22023'; end if;
  next_state:=case when p_retry and p_code='worker_error' and job.attempts<3 then 'queued' else 'failed' end;
  update public.tn_jobs set state=next_state,lease_until=null where id=p_job;
  update public.tn_trust_runs set state=next_state,failure_code=p_code,failure_diagnostics=p_diagnostics where id=job.run_id;
end $$;

-- Compare canonical rounding without trusting a separately supplied output body.
create function public.tn_graph_canonical_matches(a jsonb,b jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare key text; value jsonb; i integer;
begin
  if jsonb_typeof(a) is distinct from jsonb_typeof(b) then return false; end if;
  case jsonb_typeof(a)
    when 'number' then return abs((a::text)::numeric-(b::text)::numeric)<=0.00000000000051;
    when 'array' then
      if jsonb_array_length(a)<>jsonb_array_length(b) then return false; end if;
      for i in 0..jsonb_array_length(a)-1 loop
        if not public.tn_graph_canonical_matches(a->i,b->i) then return false; end if;
      end loop;
    when 'object' then
      if (select count(*) from jsonb_object_keys(a))<>(select count(*) from jsonb_object_keys(b)) then return false; end if;
      for key,value in select * from jsonb_each(a) loop
        if not (b ? key) or not public.tn_graph_canonical_matches(value,b->key) then return false; end if;
      end loop;
    else return a is not distinct from b;
  end case;
  return true;
end $$;

-- The worker is trusted computation, not arbitrary app-supplied scores. The DB
-- still enforces input binding, result shape, membership, mass and complete state.
create function public.tn_complete_trust_job(p_job uuid,p_lease uuid,p_input_hash text,p_raw jsonb,p_canonical text,p_output_hash text) returns uuid
language plpgsql security definer set search_path='' as $$
declare job public.tn_jobs; run public.tn_trust_runs; frozen public.tn_graph_snapshots;
  projection text; result jsonb; row jsonb; expected_ids uuid[]; actual_ids uuid[]; total double precision; count_scores integer;
begin
  select * into job from public.tn_jobs where id=p_job for update;
  if not found or job.lease_token is distinct from p_lease or job.lease_owner is distinct from session_user then
    raise exception 'Lease unavailable' using errcode='PT409'; end if;
  select * into run from public.tn_trust_runs where id=job.run_id;
  if job.state='completed' then
    if run.output_hash=p_output_hash then return run.id; end if;
    raise exception 'Conflicting completed output' using errcode='PT409'; end if;
  if job.state<>'leased' or job.lease_until<=clock_timestamp() then raise exception 'Lease expired' using errcode='PT409'; end if;
  select * into frozen from public.tn_graph_snapshots where id=job.snapshot_id;
  if p_input_hash is distinct from frozen.input_hash or p_raw->>'input_hash' is distinct from frozen.input_hash
    or p_raw->>'schema_version' is distinct from 'trust-artifact-v1'
    or p_raw->'runtime'->>'node' is distinct from 'v22.23.2'
    or p_raw->'runtime'->>'implementation' is distinct from 'graph-trust-v1.0.0'
    or octet_length(p_raw::text)>2097152 or octet_length(p_canonical)>2097152
    or p_canonical is null or p_output_hash is distinct from encode(sha256(convert_to(p_canonical,'UTF8')),'hex')
    or p_canonical::jsonb->>'input_hash' is distinct from frozen.input_hash
    or p_canonical::jsonb->'runtime' is distinct from p_raw->'runtime'
    or not public.tn_graph_canonical_matches(p_raw,p_canonical::jsonb) then
    raise exception 'Invalid replay artifact' using errcode='PT422'; end if;
  foreach projection in array array['resource','site'] loop
    result:=p_raw->'results'->projection;
    if result->>'status' is distinct from 'completed' or result->'algorithm' is distinct from public.tn_graph_config()
      or result->>'projection' is distinct from projection or jsonb_typeof(result->'scores') is distinct from 'array'
      or not (coalesce((result->'diagnostics'->>'residual')::double precision,1) between 0 and 0.000001)
      or not (coalesce((result->'diagnostics'->>'iterations')::integer,0) between 1 and 100)
      or p_canonical::jsonb->'results'->projection->>'status' is distinct from 'completed' then
      raise exception 'Result is not a completed graph' using errcode='PT422'; end if;
    select array_agg(distinct (entry->>case when projection='resource' then 'source_id' else 'site_id' end)::uuid order by
        (entry->>case when projection='resource' then 'source_id' else 'site_id' end)::uuid) into expected_ids
      from jsonb_array_elements(frozen.input_text::jsonb->'template'->'snapshot'->'entries') entry
      where entry->>case when projection='resource' then 'source_id' else 'site_id' end is not null;
    select array_agg((score->>'node_id')::uuid order by (score->>'node_id')::uuid),count(*),sum((score->>'mass')::double precision)
      into actual_ids,count_scores,total from jsonb_array_elements(result->'scores') score;
    if actual_ids is distinct from expected_ids or count_scores not between 1 and 1000 or abs(total-1)>0.0000000001 then
      raise exception 'Incomplete result members or mass' using errcode='PT422'; end if;
    for row in select * from jsonb_array_elements(result->'scores') loop
      if not (coalesce((row->>'mass')::double precision,-1) between 0 and 1)
        or (row->'contributions'->>'total')::double precision is distinct from (row->>'mass')::double precision
        or jsonb_typeof(row->'contributions'->'incoming') is distinct from 'array' then
        raise exception 'Invalid score ledger' using errcode='PT422'; end if;
    end loop;
    insert into public.tn_trust_scores(run_id,projection,node_id,mass,score)
      select run.id,projection,(score->>'node_id')::uuid,(score->>'mass')::double precision,score from jsonb_array_elements(result->'scores') score;
  end loop;
  if job.lease_until<=clock_timestamp() then raise exception 'Lease expired during completion' using errcode='PT409'; end if;
  update public.tn_trust_runs set state='completed',raw_result=p_raw,canonical_output=p_canonical,output_hash=p_output_hash,
    completed_at=clock_timestamp(),failure_code=null where id=run.id;
  update public.tn_jobs set state='completed' where id=job.id;
  return run.id;
end $$;

create function public.tn_publish_trust_run(p_run uuid,p_pack_revision integer,p_evidence_revision bigint) returns uuid
language plpgsql security definer set search_path='' as $$
declare run public.tn_trust_runs; frozen public.tn_graph_snapshots; pack public.tn_packs; publication uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into run from public.tn_trust_runs where id=p_run and requester_id=auth.uid();
  select * into frozen from public.tn_graph_snapshots where id=run.snapshot_id;
  select * into pack from public.tn_packs where id=frozen.pack_id and owner_id=auth.uid() for update;
  if pack.id is null then raise exception 'Run unavailable' using errcode='PT404'; end if;
  if run.state<>'completed' then raise exception 'Run is not completed' using errcode='PT409'; end if;
  if not pack.is_public or not frozen.captured_public or pack.trust_visibility_epoch<>frozen.visibility_epoch
    or pack.revision is distinct from p_pack_revision or frozen.pack_revision<>pack.revision
    or frozen.evidence_revision is distinct from p_evidence_revision
    or frozen.evidence_revision<>(select evidence_revision from public.tn_pack_versions where id=frozen.template_version_id) then
    raise exception 'Run inputs or visibility changed; capture again' using errcode='PT409'; end if;
  insert into public.tn_policy_publications(run_id,published_by) values(p_run,auth.uid()) on conflict(run_id) do nothing;
  select id into publication from public.tn_policy_publications where run_id=p_run;
  return publication;
end $$;

-- One statement snapshot and caller RLS for status, scores and export parts.
create function public.tn_read_trust_run(p_run uuid,p_part text default 'status',p_projection text default 'site',p_offset integer default 0,p_node uuid default null) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare run public.tn_trust_runs; frozen public.tn_graph_snapshots; pack public.tn_packs; version public.tn_pack_versions; scores jsonb;
begin
  select * into run from public.tn_trust_runs where id=p_run;
  if not found then raise exception 'Run unavailable' using errcode='PT404'; end if;
  select * into frozen from public.tn_graph_snapshots where id=run.snapshot_id;
  if p_part='input' then return jsonb_build_object('text',frozen.input_text); end if;
  if p_part in ('canonical','raw','manifest','score') and run.state<>'completed' then raise exception 'Run is not completed' using errcode='PT409'; end if;
  if p_part='canonical' then return jsonb_build_object('text',run.canonical_output); end if;
  if p_part='raw' then return run.raw_result; end if;
  if p_part='manifest' then return jsonb_build_object('schema_version','trust-export-v1','run_id',run.id,
    'input_hash',frozen.input_hash,'output_hash',run.output_hash,'runtime',run.raw_result->'runtime',
    'input_encoding','PostgreSQL jsonb text, UTF-8','output_encoding','stable JSON, result numbers rounded to 12 decimals'); end if;
  if p_projection not in ('resource','site') or p_projection is null or p_offset is null or p_offset not between 0 and 1000 then
    raise exception 'Invalid score page' using errcode='22023'; end if;
  if p_part='score' then
    select score into scores from public.tn_trust_scores where run_id=p_run and projection=p_projection and node_id=p_node;
    if scores is null then raise exception 'Node not ranked in this run' using errcode='PT404'; end if;
    return jsonb_build_object('run_id',run.id,'projection',p_projection,'score',scores);
  end if;
  if p_part<>'status' or p_part is null then raise exception 'Invalid export part' using errcode='22023'; end if;
  select * into pack from public.tn_packs where id=frozen.pack_id;
  select * into version from public.tn_pack_versions where id=frozen.template_version_id;
  select coalesce(jsonb_agg(score order by mass desc,node_id),'[]') into scores from (
    select score,mass,node_id from public.tn_trust_scores where run_id=p_run and projection=p_projection order by mass desc,node_id limit 100 offset p_offset
  ) page;
  return jsonb_build_object('run_id',run.id,'state',run.state,'failure_code',run.failure_code,'failure_diagnostics',run.failure_diagnostics,
    'created_at',run.created_at,'completed_at',run.completed_at,'input_hash',frozen.input_hash,'output_hash',run.output_hash,
    'current_public',pack.is_public,'template_version_id',frozen.template_version_id,'pack_revision',frozen.pack_revision,'evidence_revision',frozen.evidence_revision,
    'stale',pack.revision<>frozen.pack_revision or version.evidence_revision<>frozen.evidence_revision or pack.trust_visibility_epoch<>frozen.visibility_epoch,
    'published',exists(select 1 from public.tn_policy_publications where run_id=p_run),
    'public_readable',run.state='completed' and frozen.captured_public and pack.is_public and pack.trust_visibility_epoch=frozen.visibility_epoch
      and exists(select 1 from public.tn_policy_publications where run_id=p_run),
    'diagnostics',run.raw_result->'results'->p_projection->'diagnostics',
    'evidence_state',run.raw_result->'results'->p_projection->'evidence_state',
    'projection',p_projection,'offset',p_offset,'limit',100,'scores',scores);
end $$;

-- Grant only the intended entry points; Supabase can assign direct default grants.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('tn_graph_visibility_epoch','tn_graph_evidence_changed','tn_graph_config',
      'tn_graph_canonical_matches','tn_read_trust_run','tn_can_read_trust_run','tn_enqueue_trust_run','tn_lease_trust_job','tn_fail_trust_job','tn_complete_trust_job','tn_publish_trust_run') loop
    execute format('revoke all on function %s from public,anon,authenticated,tn_graph_worker',f.signature);
  end loop;
end $$;
grant execute on function public.tn_can_read_trust_run(uuid),public.tn_read_trust_run(uuid,text,text,integer,uuid) to anon,authenticated;
grant execute on function public.tn_enqueue_trust_run(uuid,integer,bigint,uuid),public.tn_publish_trust_run(uuid,integer,bigint) to authenticated;
grant execute on function public.tn_lease_trust_job(),public.tn_fail_trust_job(uuid,uuid,text,boolean,jsonb),
  public.tn_complete_trust_job(uuid,uuid,text,jsonb,text,text) to tn_graph_worker;
commit;
