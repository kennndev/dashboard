-- Allow INSERTs from service_role (admin API key)
create policy dashboard_admin_insert
  on dashboard_roles
  for insert
  to service_role
  with check (true);

-- Allow DELETEs from service_role
create policy dashboard_admin_delete
  on dashboard_roles
  for delete
  to service_role
  using (true);
