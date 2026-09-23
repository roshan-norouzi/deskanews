# Phase 3 — object storage, signed media, cursor pages, read replica

## Storage

`STORAGE_TYPE=s3` stores fonts, cover images, and generated social media in S3. Compose runs MinIO and creates the bucket on API startup. Without `STORAGE_TYPE=s3`, files stay on `STORAGE_PATH`.

## Signed URLs

When `MEDIA_URL_SECRET` or `SETTINGS_ENCRYPTION_KEY` is set, font, cover-image, and social-media routes reject requests without a valid `exp` and `sig`. Settings and generated-media responses append that signature. Source icons stay public because they are domain favicons, not tenant files.

## Lists

`GET /publishing/news/articles` and `GET /publishing/social/articles` return `{ items, nextCursor }` with 50 rows per page. Pass `cursor` for the next page. Dashboard and these lists use `DATABASE_REPLICA_URL` when it is set, and the primary otherwise.
