-- add an "active" flag (defaults false)
alter table public.collections add column active boolean default false;

-- ensure only ONE row can have active = true
create unique index one_active_collection
  on public.collections (active)
  where active = true;
