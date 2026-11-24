begin;
-- Dining table IDs are display names such as "Table 1" or a customer's name.
alter table public.active_tables drop constraint active_tables_id_check;
alter table public.active_tables add constraint active_tables_id_check
  check (length(id) between 1 and 128 and position('/' in id)=0 and id not in ('.','..'));
commit;
