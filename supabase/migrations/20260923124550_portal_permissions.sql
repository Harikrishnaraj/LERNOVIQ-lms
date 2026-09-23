-- T-019: seed the permissions route guards check. Each of the 7 roles gets
-- access to exactly one portal: learner -> learner, instructor -> instructor,
-- every back-office role (admin/super_admin/support_agent/content_reviewer/
-- org_admin) -> admin. Finer-grained permissions are added as later tasks
-- need them.
insert into public.permissions (id, description) values
  ('portal.learner.access', 'Access the learner portal'),
  ('portal.instructor.access', 'Access the instructor portal'),
  ('portal.admin.access', 'Access the admin console');

insert into public.role_permissions (role_id, permission_id) values
  ('learner', 'portal.learner.access'),
  ('instructor', 'portal.instructor.access'),
  ('admin', 'portal.admin.access'),
  ('super_admin', 'portal.admin.access'),
  ('support_agent', 'portal.admin.access'),
  ('content_reviewer', 'portal.admin.access'),
  ('org_admin', 'portal.admin.access');
