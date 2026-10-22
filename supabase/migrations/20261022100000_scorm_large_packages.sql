-- Raise the SCORM storage caps to match src/services/scorm/parse.ts: the staged zip may be up to
-- 2GB (MAX_ZIP_BYTES) and each extracted file up to 300MB (MAX_FILE_BYTES). The hosted project's
-- global upload limit (Dashboard → Storage → Settings) must be at least 2GB for this to apply.
update storage.buckets set file_size_limit = 2147483648 where id = 'scorm-uploads';
update storage.buckets set file_size_limit = 314572800 where id = 'scorm-packages';
