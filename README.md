# BoutiqueFlow

BoutiqueFlow is a tailoring order and customer manager built with Next.js. It stores orders, customers, and shop settings in Supabase PostgreSQL, and keeps uploaded slip/design photos in a private S3-compatible bucket.

## Local development

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Without storage environment variables, local development uses SQLite at `data/boutique.db` and local uploads at `data/uploads/`. Those files are excluded from Git.

To use the hosted services locally, copy `.env.example` to `.env.local` and fill in the values described below. Keep `.env.local` private and never commit credentials.

## Configure Supabase

1. Create a Supabase project.
2. Open **SQL Editor**, run the contents of [`supabase/schema.sql`](./supabase/schema.sql).
3. In **Project Settings → Database → Connection string**, choose the **Transaction pooler** and copy its URI into `SUPABASE_DB_URL`. Use the pooler connection string, not a local database path.

The app uses the server-side database connection only. Do not expose this connection string in client-side environment variables.

## Configure S3 image storage

Create a private bucket and an access key with permission to read and write objects in that bucket. Set:

- `S3_BUCKET`: bucket name
- `S3_REGION`: bucket region
- `S3_ACCESS_KEY_ID`: access key ID
- `S3_SECRET_ACCESS_KEY`: secret access key
- `S3_ENDPOINT`: optional endpoint for an S3-compatible service; leave blank for AWS S3

The app proxies image reads through `/api/files/`, so the bucket does not need public access or browser CORS rules.

## Deploy to Vercel

1. Add `SUPABASE_DB_URL` and all required `S3_*` variables in **Project Settings → Environment Variables**. Add them to Production (and Preview/Development if needed).
2. If using Gemini OCR, also set `GEMINI_API_KEY`.
3. Redeploy after saving the environment variables.

Vercel's function filesystem is not persistent, so production requires the configured Supabase and S3 storage. If configuration is missing, the server reports which environment variable group is required rather than trying to write customer data into the deployment filesystem.

## Existing local data

The app does not automatically copy local SQLite records or images to Supabase/S3. Local data remains in `data/`; keep a backup and request a migration before deleting or replacing it.
