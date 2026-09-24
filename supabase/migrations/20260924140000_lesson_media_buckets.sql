-- T-053: private buckets for lesson videos and attachments. No storage.objects policies for API
-- roles: uploads go through server-issued signed upload URLs; reads through short-lived signed URLs
-- created after an access check (entitlement-aware, guidelines section 19).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('course-videos', 'course-videos', false, 52428800, array['video/mp4', 'video/webm']),
  ('lesson-assets', 'lesson-assets', false, 10485760, array[
    'application/pdf', 'application/zip', 'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png', 'image/jpeg'
  ])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
