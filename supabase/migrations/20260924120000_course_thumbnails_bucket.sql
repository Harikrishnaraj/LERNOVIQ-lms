-- T-051: public-read bucket for course thumbnails. No storage.objects policies for API roles:
-- uploads and deletes happen only through the service role after the server validated the file.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('course-thumbnails', 'course-thumbnails', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
