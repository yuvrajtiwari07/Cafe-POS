-- Run against the deployed schema with psql -v ON_ERROR_STOP=1.
-- All fixtures are rolled back, including join requests and writes.
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","email":"owner@example.test"}',true);
select public.write_records('[{"table":"cafes","id":"migration-test-cafe","action":"set","data":{"name":"Migration Test","ownerId":"11111111-1111-4111-8111-111111111111","memberUids":["11111111-1111-4111-8111-111111111111"],"members":[],"pendingRequests":[],"secretCode":"TEST-ONLY-MIGRATION"}}]');
select public.write_records('[{"table":"menu_items","cafe_id":"migration-test-cafe","id":"coffee","action":"set","data":{"name":"Coffee","price":100}},{"table":"active_tables","cafe_id":"migration-test-cafe","id":"Table 1","action":"set","data":{"items":[]}}]');
-- Partial JSON merge preserves required fields and unrelated values.
select public.write_records('[{"table":"menu_items","cafe_id":"migration-test-cafe","id":"coffee","action":"set","merge":true,"data":{"price":110}}]');
do $$ begin
 if (select data->>'name' from public.menu_items where cafe_id='migration-test-cafe' and id='coffee') <> 'Coffee' then raise exception 'Merge lost name'; end if;
 begin
  perform public.write_records('[{"table":"menu_items","cafe_id":"migration-test-cafe","id":"rollback","action":"set","data":{"name":"Rollback","price":20}},{"table":"menu_items","cafe_id":"migration-test-cafe","id":"invalid","action":"set","data":{"name":"Invalid","price":-1}}]');
  raise exception 'Invalid batch unexpectedly succeeded';
 exception when others then
  if sqlerrm='Invalid batch unexpectedly succeeded' then raise; end if;
 end;
 if exists(select 1 from public.menu_items where id='rollback') then raise exception 'Batch did not roll back'; end if;
end $$;
-- Outsider cannot enumerate cafes or their records, and cannot self-promote.
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","email":"staff@example.test"}',true);
do $$ begin
 if exists(select 1 from public.cafes where id='migration-test-cafe') or exists(select 1 from public.menu_items where cafe_id='migration-test-cafe') then raise exception 'Tenant data leaked'; end if;
 begin
  perform public.write_records('[{"table":"menu_items","cafe_id":"migration-test-cafe","id":"hacked","action":"set","data":{"name":"Hacked","price":1}}]');
  raise exception 'Cross-tenant write succeeded';
 exception when insufficient_privilege then null; end;
 if not (public.request_cafe_join('BAD-CODE') ? 'error') then raise exception 'Bad code accepted'; end if;
end $$;
reset role;
delete from public.join_attempts where user_id='22222222-2222-4222-8222-222222222222';
set local role authenticated;
select public.request_cafe_join('TEST-ONLY-MIGRATION');
do $$ begin
 if exists(select 1 from public.cafes where id='migration-test-cafe') then raise exception 'Pending staff can read private cafe'; end if;
end $$;
-- Owner approves the request.
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111"}',true);
do $$ begin
 if (select jsonb_array_length(data->'pendingRequests') from public.cafes where id='migration-test-cafe')<>1 then raise exception 'Request missing'; end if;
end $$;
select public.write_records('[{"table":"cafes","id":"migration-test-cafe","action":"update","data":{"memberUids":["11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222"],"pendingRequests":[]}}]');
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222"}',true);
do $$ begin
 if not exists(select 1 from public.menu_items where cafe_id='migration-test-cafe') then raise exception 'Approved staff cannot read'; end if;
 begin
  perform public.write_records('[{"table":"cafes","id":"migration-test-cafe","action":"update","data":{"memberUids":["22222222-2222-4222-8222-222222222222"]}}]');
  raise exception 'Membership hijack succeeded';
 exception when others then if sqlerrm='Membership hijack succeeded' then raise; end if; end;
 begin
  perform public.write_records('[{"table":"cafes","id":"migration-test-cafe","action":"update","data":{"name":"Hijacked"}}]');
  raise exception 'Staff changed cafe settings';
 exception when others then if sqlerrm='Staff changed cafe settings' then raise; end if; end;
end $$;
select public.write_records('[{"table":"cafes","id":"migration-test-cafe","action":"update","data":{"googleSpreadsheetId":"test-sheet"}}]');
-- Replaying a queued bill must update the same row, not duplicate it.
select public.write_records('[{"table":"bills","cafe_id":"migration-test-cafe","id":"bill-1","action":"set","merge":true,"data":{"billNumber":"TEST-1","items":[{"name":"Coffee"}],"grandTotal":110,"status":"paid","cashierId":"22222222-2222-4222-8222-222222222222"}}]');
select public.write_records('[{"table":"bills","cafe_id":"migration-test-cafe","id":"bill-1","action":"set","merge":true,"data":{"syncedAt":"2026-11-24"}}]');
do $$ begin
 if (select count(*) from public.bills where cafe_id='migration-test-cafe')<>1 then raise exception 'Duplicate bill'; end if;
 begin
  perform public.write_records('[{"table":"bills","cafe_id":"migration-test-cafe","id":"spoof","action":"set","data":{"billNumber":"SPOOF","items":[{}],"grandTotal":10,"status":"paid","cashierId":"11111111-1111-4111-8111-111111111111"}}]');
  raise exception 'Cashier spoof succeeded';
 exception when others then if sqlerrm='Cashier spoof succeeded' then raise; end if; end;
end $$;
-- A void operation and its network retry are idempotent, but staff cannot unvoid.
select public.write_records('[{"table":"bills","cafe_id":"migration-test-cafe","id":"bill-1","action":"update","data":{"status":"void"}}]');
select public.write_records('[{"table":"bills","cafe_id":"migration-test-cafe","id":"bill-1","action":"set","merge":true,"data":{"status":"void","syncedAt":"retry"}}]');
do $$ begin
 begin
  perform public.write_records('[{"table":"bills","cafe_id":"migration-test-cafe","id":"bill-1","action":"update","data":{"status":"paid"}}]');
  raise exception 'Staff restored voided bill';
 exception when others then if sqlerrm='Staff restored voided bill' then raise; end if; end;
end $$;
-- After revocation, reads disappear and writes are denied again.
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111"}',true);
select public.write_records('[{"table":"cafes","id":"migration-test-cafe","action":"update","data":{"memberUids":["11111111-1111-4111-8111-111111111111"]}}]');
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222"}',true);
do $$ begin
 if exists(select 1 from public.bills where cafe_id='migration-test-cafe') then raise exception 'Revoked staff still has access'; end if;
end $$;
reset role;
set local role anon;
do $$ begin
 begin
  perform public.write_records('[]'); raise exception 'Anonymous write accepted';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'All database permission and atomicity checks passed' as result;
