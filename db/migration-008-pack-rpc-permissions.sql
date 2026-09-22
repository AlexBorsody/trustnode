-- Run after 007. Supabase can grant EXECUTE directly to anon by default;
-- revoking PUBLIC alone in 003/004 does not remove those explicit grants.
begin;
revoke all on function public.tn_create_pack(text,text,text,text[],boolean,jsonb) from public, anon;
revoke all on function public.tn_update_pack(uuid,integer,text,text,text,text[],boolean,jsonb) from public, anon;
revoke all on function public.tn_delete_pack(uuid,integer) from public, anon;
grant execute on function public.tn_create_pack(text,text,text,text[],boolean,jsonb) to authenticated;
grant execute on function public.tn_update_pack(uuid,integer,text,text,text,text[],boolean,jsonb) to authenticated;
grant execute on function public.tn_delete_pack(uuid,integer) to authenticated;
commit;
