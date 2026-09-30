create policy "season can be finalized or reset"
on public.seasons
for update
to anon, authenticated
using (status in ('active', 'completed'))
with check (
  (status = 'completed' and end_date is not null)
  or
  (status = 'active' and end_date is null)
);
