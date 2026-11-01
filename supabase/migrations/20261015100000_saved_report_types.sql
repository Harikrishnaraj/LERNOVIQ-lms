-- T-274: report catalogue (F-420). A saved report now names its report type. Every existing row is
-- the platform daily analytics CSV, so the default keeps current reports working unchanged. The
-- eight other types are registered here so the catalogue is complete, but they are not generated
-- yet: each is enabled by its own task (T-275 user reports, T-276 usage and product reports) once
-- its real data query exists. Generation refuses unavailable types, see src/features/admin/reports.ts.

alter table public.saved_reports
  add column report_type text not null default 'daily_analytics'
  check (
    report_type in (
      'daily_analytics',
      'idle_users',
      'user_product_duration',
      'individual_user_progress',
      'consolidated_course_module_usage',
      'consolidated_course_library_usage',
      'product_course_library_licence_status',
      'product_course_library_usage',
      'product_course_module_usage'
    )
  );

create index saved_reports_type_idx on public.saved_reports (report_type);
