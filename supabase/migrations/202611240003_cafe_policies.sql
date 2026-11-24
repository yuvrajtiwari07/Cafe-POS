begin;
-- Check the proposed row directly: an INSERT ... ON CONFLICT cannot look up
-- its new cafe through a helper before the row has been inserted.
alter policy cafes_read on public.cafes using
  (owner_id=auth.uid() or data->'memberUids' ? auth.uid()::text);
alter policy cafes_update on public.cafes using
  (owner_id=auth.uid() or data->'memberUids' ? auth.uid()::text)
  with check (owner_id=auth.uid() or data->'memberUids' ? auth.uid()::text);
commit;
