-- Run after 009. Apply source identity rules to direct writes as well as RPCs.
begin;

-- Do not rewrite legacy rows. CHECK still enforces every new/updated row.
-- Coalesce nullable fields explicitly: SQL NULL must not bypass the constraint.
alter table public.tn_sources add constraint tn_source_kind_identity check (
  case kind
    when 'link' then
      coalesce(url ~ '^https?://[^[:space:]\\/?#@]+([/?#][^[:space:]\\]*)?$', false)
      and file_path is null and file_name is null and mime_type is null
    when 'file' then
      url is null
      and coalesce(length(file_path) between 38 and 512, false)
      and coalesce(file_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._/-]+$', false)
      and file_path !~ '(^|/)\.\.?(/|$)|//' and right(file_path, 1) <> '/'
      -- Account deletion may null attribution; it must not delete the source.
      and (owner_id is null or split_part(file_path, '/', 1) = owner_id::text)
      and coalesce(length(btrim(file_name)) between 1 and 120, false)
      and coalesce(mime_type in ('application/pdf','text/plain','text/markdown','text/csv','application/json'), false)
    else false
  end
) not valid;

-- INSERT and caller RLS remain intact for tn_save_source (SECURITY INVOKER).
commit;
