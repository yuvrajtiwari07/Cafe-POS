begin;

create table public.cafes (
  id text primary key check (id ~ '^[a-zA-Z0-9_-]{1,128}$'),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  owner_id uuid generated always as ((data->>'ownerId')::uuid) stored not null,
  join_code text generated always as (upper(data->>'secretCode')) stored not null unique,
  updated_at timestamptz not null default now(),
  check (length(data->>'name') between 1 and 100),
  check (jsonb_typeof(data->'memberUids') = 'array')
);
create index cafes_members on public.cafes using gin ((data->'memberUids'));
create index cafes_owner on public.cafes(owner_id);
alter table public.cafes enable row level security;

-- Only these helpers bypass RLS, to avoid recursively querying the cafes policy.
create function public.is_cafe_member(target text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.cafes c where c.id=target and
    (c.owner_id=auth.uid() or c.data->'memberUids' ? auth.uid()::text));
$$;
create function public.is_cafe_owner(target text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.cafes c where c.id=target and c.owner_id=auth.uid());
$$;
revoke all on function public.is_cafe_member(text), public.is_cafe_owner(text) from public;
grant execute on function public.is_cafe_member(text), public.is_cafe_owner(text) to authenticated;
create policy cafes_read on public.cafes for select to authenticated using (public.is_cafe_member(id));
create policy cafes_create on public.cafes for insert to authenticated with check (owner_id=auth.uid());
create policy cafes_update on public.cafes for update to authenticated
  using (public.is_cafe_member(id)) with check (public.is_cafe_member(id));
create policy cafes_delete on public.cafes for delete to authenticated using (owner_id=auth.uid());
grant select,insert,update,delete on public.cafes to authenticated;

create function public.validate_cafe() returns trigger language plpgsql set search_path='' as $$
begin
  if new.data ?| array['isAdmin','admin','role'] then raise exception 'Invalid cafe fields'; end if;
  if not (new.data->'memberUids' ? (new.data->>'ownerId')) then raise exception 'Owner must remain a member'; end if;
  if tg_op='UPDATE' then
    if new.id<>old.id or new.data->>'ownerId' is distinct from old.data->>'ownerId' then
      raise exception 'Cafe ownership cannot be changed';
    end if;
    -- The join RPC runs as the database owner. Regular staff can only sync Sheets metadata.
    if current_user='authenticated' and old.owner_id<>auth.uid() and
      (new.data - array['googleSpreadsheetId','googleSpreadsheetUrl','googleSheetTitle','lastSheetSyncedAt','initialExpensesSeededAt','updatedAt'])
      is distinct from
      (old.data - array['googleSpreadsheetId','googleSpreadsheetUrl','googleSheetTitle','lastSheetSyncedAt','initialExpensesSeededAt','updatedAt']) then
      raise exception 'Only the owner can change cafe settings or membership';
    end if;
  end if;
  new.data := new.data || jsonb_build_object('id',new.id);
  new.updated_at := now();
  return new;
end $$;
create trigger validate_cafe before insert or update on public.cafes for each row execute function public.validate_cafe();

-- JSONB preserves invoice snapshots/recipes without rewriting historical prices.
-- Tenant and record identity remain relational, indexed and protected by RLS.
do $$
declare t text;
begin
  foreach t in array array['menu_items','bills','ledger_entries','cafe_settings','active_tables','inventory_items','recipes','inventory_movements'] loop
    execute format('create table public.%I (
      cafe_id text not null references public.cafes(id) on delete cascade,
      id text not null check (id ~ ''^[a-zA-Z0-9_-]{1,128}$''),
      data jsonb not null check (jsonb_typeof(data) = ''object''),
      updated_at timestamptz not null default now(),
      primary key (cafe_id,id))',t);
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy tenant_read on public.%I for select to authenticated using (public.is_cafe_member(cafe_id))',t);
    execute format('create policy tenant_insert on public.%I for insert to authenticated with check (public.is_cafe_member(cafe_id))',t);
    if t <> 'inventory_movements' then
      execute format('create policy tenant_update on public.%I for update to authenticated using (public.is_cafe_member(cafe_id)) with check (public.is_cafe_member(cafe_id))',t);
      execute format('create policy tenant_delete on public.%I for delete to authenticated using (public.%s(cafe_id))',t,
        case when t in ('bills','cafe_settings') then 'is_cafe_owner' else 'is_cafe_member' end);
    end if;
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
    execute format('alter publication supabase_realtime add table public.%I',t);
  end loop;
end $$;
alter publication supabase_realtime add table public.cafes;
create index bills_created on public.bills(cafe_id, (data->>'createdAt'), id);
create index ledger_created on public.ledger_entries(cafe_id, (data->>'createdAt'), id);

create function public.validate_record() returns trigger language plpgsql set search_path='' as $$
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
        (old.data->>'status'='void' and new.data is distinct from old.data)) then raise exception 'Bill change requires owner'; end if;
    end if;
  elsif tg_table_name='ledger_entries' then
    if jsonb_typeof(new.data->'amount') is distinct from 'number' or (new.data->>'amount')::numeric <= 0 or
      coalesce(new.data->>'kind','') not in ('expenditure','withdrawal','cc_topup') or
      coalesce(new.data->>'paymentMode','') not in ('cash','upi','credit_card','personal') then raise exception 'Invalid ledger entry'; end if;
  end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['menu_items','bills','ledger_entries','cafe_settings','active_tables','inventory_items','recipes','inventory_movements'] loop
    execute format('create trigger validate_record before insert or update on public.%I for each row execute function public.validate_record()',t);
  end loop;
end $$;

-- Invoker rights are intentional: every operation is checked by RLS and triggers.
-- A batch is one transaction and merge patches happen atomically in PostgreSQL.
create function public.write_records(operations jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare op jsonb; t text; payload jsonb; changed integer; existing_data jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if jsonb_typeof(operations)<>'array' or jsonb_array_length(operations)>500 then raise exception 'Invalid batch'; end if;
  for op in select value from jsonb_array_elements(operations) loop
    t:=op->>'table'; payload:=op->'data';
    if t not in ('cafes','menu_items','bills','ledger_entries','cafe_settings','active_tables','inventory_items','recipes','inventory_movements') then
      raise exception 'Invalid table';
    end if;
    if op->>'action'='delete' then
      execute format('delete from public.%I where id=$1 %s',t,case when t='cafes' then '' else 'and cafe_id=$2' end)
        using op->>'id',op->>'cafe_id';
    elsif op->>'action'='update' then
      execute format('update public.%I set data=data || $1 where id=$2 %s',t,case when t='cafes' then '' else 'and cafe_id=$3' end)
        using payload,op->>'id',op->>'cafe_id';
      get diagnostics changed=row_count;
      if changed=0 then raise exception 'Record not found or access denied'; end if;
    elsif op->>'action'='set' then
      execute format('select data from public.%I where id=$1 %s for update',t,
        case when t='cafes' then '' else 'and cafe_id=$2' end)
        into existing_data using op->>'id',op->>'cafe_id';
      if existing_data is not null then
        if coalesce((op->>'merge')::boolean,false) then payload:=existing_data || payload; end if;
        execute format('update public.%I set data=$1 where id=$2 %s',t,
          case when t='cafes' then '' else 'and cafe_id=$3' end)
          using payload,op->>'id',op->>'cafe_id';
        get diagnostics changed=row_count;
        if changed=0 then raise exception 'Update denied'; end if;
      elsif t='cafes' then
        execute 'insert into public.cafes as existing(id,data) values($1,$2)
          on conflict(id) do update set data=case when $3 then existing.data || excluded.data else excluded.data end'
          using op->>'id',payload,coalesce((op->>'merge')::boolean,false);
      else
        execute format('insert into public.%I as existing(cafe_id,id,data) values($1,$2,$3)
          on conflict(cafe_id,id) do update set data=case when $4 then existing.data || excluded.data else excluded.data end',t)
          using op->>'cafe_id',op->>'id',payload,coalesce((op->>'merge')::boolean,false);
      end if;
    else raise exception 'Invalid write action'; end if;
  end loop;
end $$;
revoke all on function public.write_records(jsonb) from public;
grant execute on function public.write_records(jsonb) to authenticated;

-- Code lookup never exposes another restaurant's private document or staff list.
create table public.join_attempts(user_id uuid primary key, attempted_at timestamptz not null);
alter table public.join_attempts enable row level security;
revoke all on public.join_attempts from anon,authenticated;
create function public.request_cafe_join(code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target public.cafes; requests jsonb; last_attempt timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select attempted_at into last_attempt from public.join_attempts where user_id=auth.uid();
  if last_attempt > now()-interval '3 seconds' then return jsonb_build_object('error','Please wait a few seconds before trying again.'); end if;
  insert into public.join_attempts values(auth.uid(),now()) on conflict(user_id) do update set attempted_at=excluded.attempted_at;
  select * into target from public.cafes where join_code=upper(trim(code)) for update;
  if not found then return jsonb_build_object('error','Invalid staff code. Ask the owner for the current code.'); end if;
  if not public.is_cafe_member(target.id) then
    requests:=coalesce(target.data->'pendingRequests','[]'::jsonb);
    if not exists(select 1 from jsonb_array_elements(requests) r where r->>'uid'=auth.uid()::text) then
      requests:=requests || jsonb_build_array(jsonb_build_object('uid',auth.uid()::text,
        'email',auth.jwt()->>'email','name',coalesce(auth.jwt()->'user_metadata'->>'full_name',auth.jwt()->>'email','Staff'),
        'requestedAt',now()));
      update public.cafes set data=data || jsonb_build_object('pendingRequests',requests,'updatedAt',now()) where id=target.id;
    end if;
  end if;
  return jsonb_build_object('id',target.id,'name',target.data->>'name');
end $$;
revoke all on function public.request_cafe_join(text) from public;
grant execute on function public.request_cafe_join(text) to authenticated;
notify pgrst,'reload schema';
commit;
