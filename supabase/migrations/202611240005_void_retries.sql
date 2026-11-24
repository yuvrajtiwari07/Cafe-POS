begin;
-- A network retry may refresh sync metadata on an otherwise unchanged voided bill.
create or replace function public.validate_record() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' and (new.cafe_id<>old.cafe_id or new.id<>old.id) then raise exception 'Record identity cannot change'; end if;
  new.data := new.data || jsonb_build_object('id',new.id,'cafeId',new.cafe_id);
  new.updated_at := now();
  if tg_table_name='menu_items' then
    if coalesce(length(new.data->>'name'),0) not between 1 and 100 or
      jsonb_typeof(new.data->'price') is distinct from 'number' or (new.data->>'price')::numeric < 0 then
      raise exception 'Menu items require a name and nonnegative price';
    end if;
  elsif tg_table_name='bills' then
    if jsonb_typeof(new.data->'items') is distinct from 'array' or
      jsonb_typeof(new.data->'grandTotal') is distinct from 'number' or
      (new.data->>'grandTotal')::numeric < 0 or coalesce(length(new.data->>'billNumber'),0)=0 or
      coalesce(new.data->>'status','') not in ('paid','void') then raise exception 'Invalid bill'; end if;
    if jsonb_array_length(new.data->'items')=0 then raise exception 'Bill must contain items'; end if;
    if not public.is_cafe_owner(new.cafe_id) then
      if tg_op='INSERT' and new.data->>'cashierId' is distinct from auth.uid()::text then raise exception 'Invalid cashier'; end if;
      if tg_op='UPDATE' and (old.data->>'cashierId' is distinct from new.data->>'cashierId' or
        (old.data->>'status'='void' and (new.data - array['syncedAt','isSynced']) is distinct from (old.data - array['syncedAt','isSynced']))) then raise exception 'Bill change requires owner'; end if;
    end if;
  elsif tg_table_name='ledger_entries' then
    if jsonb_typeof(new.data->'amount') is distinct from 'number' or (new.data->>'amount')::numeric <= 0 or
      coalesce(new.data->>'kind','') not in ('expenditure','withdrawal','cc_topup') or
      coalesce(new.data->>'paymentMode','') not in ('cash','upi','credit_card','personal') then raise exception 'Invalid ledger entry'; end if;
  end if;
  return new;
end $$;
commit;
