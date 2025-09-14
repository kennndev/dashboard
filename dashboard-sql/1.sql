drop table if exists public.collections;

create table public.collections (
  address     text primary key,
  owner       text not null,
  cid         text,
  created_at  timestamptz default now()
);

-- easiest policy set (service‑role routes):
alter table public.collections enable row level security;
create policy allow_all on public.collections
  for all using ( true ) with check ( true );

