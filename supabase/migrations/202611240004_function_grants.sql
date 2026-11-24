begin;
-- Supabase's default privileges may grant new functions to anon explicitly.
revoke all on function public.write_records(jsonb), public.request_cafe_join(text),
  public.is_cafe_member(text), public.is_cafe_owner(text), public.validate_cafe(), public.validate_record()
  from public, anon;
commit;
