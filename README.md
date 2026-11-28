# BoutiqueFlow

BoutiqueFlow is a tailoring order and customer manager built with Next.js. Orders, customers, and shop settings are stored in AWS DynamoDB. Uploaded slip and design images are stored in a private AWS S3 bucket.

## Local development

Requirements: Node.js 22.13 or newer.

```bash
npm install
```

Copy `.env.example` to `.env.local`, configure the AWS settings below, and then start the app:

```bash
npm run dev
```

The app requires DynamoDB and S3 configuration in every environment; it does not fall back to local files or another database. Keep `.env.local` private and never commit credentials.

## Configure DynamoDB

Create three DynamoDB tables in the AWS region you will use:

| Environment variable | Table partition key | Purpose |
|---|---|---|
| `DYNAMODB_ORDERS_TABLE` | `id` (Number) | Boutique orders |
| `DYNAMODB_CUSTOMERS_TABLE` | `id` (Number) | Customers |
| `DYNAMODB_SETTINGS_TABLE` | `key` (String) | Shop settings and ID counters |

Set `AWS_REGION` to the region containing these tables. The AWS SDK uses the standard credential provider chain, so prefer an IAM role for hosted deployments or a local AWS profile for development. The application's AWS identity needs `GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, and `Scan` access to these tables.

## Configure S3 image storage

Create a private S3 bucket and set `S3_BUCKET`. Use the same `AWS_REGION` as the bucket. Grant the application's AWS identity `s3:GetObject` and `s3:PutObject` access to the bucket. Image reads are proxied through `/api/files/`, so the bucket does not need public access or browser CORS rules.

## Deploy to Vercel

Add `AWS_REGION`, all three `DYNAMODB_*_TABLE` values, and `S3_BUCKET` to the Vercel environment configuration for each deployment target. Configure AWS credentials through an IAM role or the AWS credential provider supported by the deployment environment. If using Gemini OCR, also set `GEMINI_API_KEY`. Redeploy after saving environment variables.

## Existing data

The app does not automatically migrate existing SQLite or Supabase records, or previously stored local images, into DynamoDB and S3. Back up and migrate any existing data separately before switching production traffic.
