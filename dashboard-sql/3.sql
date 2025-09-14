-- 1. table -------------------------------------------------------------------
create table dashboard_roles (
  id          bigserial primary key,
  email       text unique not null
               check (email ~* '^[^@]+@[^@]+\.[^@]+$'),
  role        text not null
               check (role in ('super_admin','admin')),
  inserted_at timestamptz default now()
);

-- 2. turn on RLS -------------------------------------------------------------
alter table dashboard_roles enable row level security;

-- 3. anyone may read ---------------------------------------------------------
create policy dashboard_read
  on dashboard_roles
  for select          -- only SELECT here
  using (true);

-- 4. only super_admins may write --------------------------------------------
-- INSERT
create policy dashboard_write_insert
  on dashboard_roles
  for insert
  with check (
    exists (
      select 1
      from dashboard_roles dr
      where dr.email = auth.jwt() ->> 'email'
        and dr.role  = 'super_admin'
    )
  );

-- UPDATE
create policy dashboard_write_update
  on dashboard_roles
  for update
  using (
    exists (
      select 1
      from dashboard_roles dr
      where dr.email = auth.jwt() ->> 'email'
        and dr.role  = 'super_admin'
    )
  )
  with check (
    exists (
      select 1
      from dashboard_roles dr
      where dr.email = auth.jwt() ->> 'email'
        and dr.role  = 'super_admin'
    )
  );

-- DELETE
create policy dashboard_write_delete
  on dashboard_roles
  for delete
  using (
    exists (
      select 1
      from dashboard_roles dr
      where dr.email = auth.jwt() ->> 'email'
        and dr.role  = 'super_admin'
    )
  );
