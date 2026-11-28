---
name: project-create-skill
description: "Project context and safe change workflow for BoutiqueFlow / boutique_shop_management. Use when adding, changing, debugging, or explaining features in this boutique tailoring order-management app."
---

# project_create_skill — BoutiqueFlow

## Purpose

Use this file as the shared project-context entry point for AI agents working in this repository. It describes the architecture, conventions, and likely change locations so agents can avoid broad repository scans. It is a guide, not a substitute for checking the specific code and contracts being changed.

## Project at a glance

- **Product:** BoutiqueFlow, a boutique/tailoring order and customer manager.
- **Main workflow:** Capture or upload a tailoring slip, optionally extract its contents with Gemini Vision OCR, verify the extracted data against the image, then save an order with measurements, billing, delivery status, and design references.
- **Other workflows:** Search and filter orders, track due dates and order stages, manage returning customers and measurement history, print slips, and prepare WhatsApp messages.
- **Stack:** Next.js App Router 16.4.6, React 19.3, TypeScript (strict mode), Tailwind CSS 4, Lucide icons, AWS SDK for DynamoDB and S3, and optional `@google/genai`.
- **Persistence:** Orders, customers, and settings use configured DynamoDB tables; uploaded images are stored in a private S3 bucket and served through the app's file API.
- **Runtime note:** Database and filesystem work belongs on the server; do not move it into Edge/client code.

## Repository map

| Location | Responsibility |
|---|---|
| `src/app/page.tsx` | Server-rendered home entry; loads orders, customers, shop settings, and the next serial number before rendering the app. |
| `src/app/layout.tsx` | Root metadata, fonts, and global layout. |
| `src/app/globals.css` | Tailwind import, theme variables, and print-specific styles. |
| `src/components/BoutiqueApp.tsx` | Main client workspace: tabs, order list/board, filters, metrics, customer directory, settings, and drawer/modal coordination. |
| `src/components/OrderFormModal.tsx` | Create/edit form, slip OCR workflow, measurements, customer linking, billing, and design-photo handling. |
| `src/components/SlipCaptureViewer.tsx` | Slip image upload/camera capture, image viewing, and OCR request/verification UI. |
| `src/components/OrderDetailDrawer.tsx` | Order history/details, stage changes, delete/edit, print, and WhatsApp actions. |
| `src/components/CustomerDetailDrawer.tsx` | Customer profile/history, edits, and append-order actions. |
| `src/components/PrintReceiptModal.tsx` | Printable tailoring slip and browser print/PDF view. |
| `src/components/NecklineSketchModal.tsx` | Canvas-based neckline/design sketch creation and upload. |
| `src/lib/types.ts` | Shared domain types, order stages, measurements, INR/phone/WhatsApp helpers, and delivery urgency logic. |
| `src/lib/db.ts` | DynamoDB persistence facade for order/customer/settings queries and mutations. |
| `src/lib/db-dynamodb.ts` | DynamoDB tables, IDs, order/customer persistence, and shop settings. |
| `src/lib/uploads.ts` | S3 upload storage, allowed image MIME/extension mapping, file resolution, and OCR image loading. |
| `src/app/api/**/route.ts` | App Router HTTP endpoints; keep request/response behavior aligned with their client callers. |

`public/` contains static Next.js starter SVG assets. `data/` contains runtime database and user-uploaded data; it is not source code.

## Domain and behavior

- **Order stages** (defined in `src/lib/types.ts`): `Received`, `Cutting`, `Stitching`, `Ready for Delivery`, and `Delivered`. Reuse `ORDER_STAGES` and `OrderStatus` instead of introducing a competing list.
- **Measurements:** String-valued tailoring fields for length, chest, waist, hip, sleeve, front/back neck, border, shoulder, bottom, and extra notes. Preserve measurement units, fractions, and Hindi/English tailoring notes; do not force them into numbers.
- **Billing:** Orders carry itemized descriptions and amounts, total, advance paid, and balance due. `db.ts` derives totals/balance when not supplied; preserve the current calculation behavior when changing billing.
- **Customers:** Orders can link to customer records. Matching uses a normalized phone key, with a name fallback when no phone key is available. Customer edits are also propagated to linked orders.
- **OCR state:** `none`, `ai_extracted`, or `verified`. OCR is optional; extracted data remains editable and uncertain fields should be checked against the original slip rather than treated as authoritative.
- **Dates and currency:** Order dates are ISO `YYYY-MM-DD`; display monetary amounts using shared `formatINR`. WhatsApp links/messages are built by helpers in `types.ts`.
- **Shop settings:** Stored in the DynamoDB settings table (`shop_name`, `shop_phone`, `shop_address`, `default_unit`).
- **Database configuration:** Set `AWS_REGION`, `DYNAMODB_ORDERS_TABLE`, `DYNAMODB_CUSTOMERS_TABLE`, and `DYNAMODB_SETTINGS_TABLE`; the AWS SDK uses the standard credential provider chain. `S3_BUCKET` configures image storage.
- **No automatic migration or seed data:** Existing SQLite/Supabase data and local uploads are not migrated automatically. The application does not create or seed DynamoDB tables.

## HTTP API map

| Method and path | Purpose |
|---|---|
| `GET /api/orders` | List orders; supports `q`, `status`, and `due` query filters and returns the next serial number. |
| `POST /api/orders` | Create an order; requires serial number, customer name, phone, order date, and delivery date. |
| `GET /api/orders/[id]` | Fetch one order. |
| `PATCH /api/orders/[id]` | Partially update an order, including its status. |
| `DELETE /api/orders/[id]` | Delete an order. |
| `GET /api/customers` | List customer summaries and histories. |
| `GET /api/customers/[id]` | Fetch one customer summary. |
| `PATCH /api/customers/[id]` | Update customer details and linked orders. |
| `GET /api/settings` | Read shop settings and whether a server Gemini key is configured. |
| `PATCH /api/settings` | Update persisted shop settings. |
| `POST /api/upload` | Save an image as multipart form data or a base64 data URL; current limit is 12 MiB. |
| `GET /api/files/[...path]` | Serve an uploaded file resolved beneath `data/uploads/`. |
| `POST /api/ocr` | Extract slip details using Gemini; accepts a stored slip URL or image data. |

Route handlers generally return JSON and report server errors with `console.error`. Keep payload shapes and user-visible errors consistent with their callers.

## Environment and sensitive data

- Optional server OCR configuration: `GEMINI_API_KEY`; optional model override: `GEMINI_MODEL`. The OCR route also accepts a temporary `x-gemini-api-key` request header from the in-session settings UI.
- Never copy, print, commit, or include actual environment values in this file, logs, examples, or responses. Refer only to variable names.
- Do not read or modify `.env.local` unless the task specifically requires secret configuration.
- Do not inspect, overwrite, reset, delete, or commit customer data as part of ordinary feature work. Use isolated test resources for database behavior.
- Do not introduce customer names, phone numbers, addresses, or actual slip images into source, docs, or fixtures.

## UI and implementation conventions

- The app has a warm cream background (`#faf7f2`), deep burgundy accent (`#5b1e31`), muted gold (`#b47b2b`), rounded cards/drawers, and bilingual tailoring vocabulary. Follow nearby component patterns and keep mobile layouts usable.
- `BoutiqueApp` and interactive modals/drawers are client components; database reads and filesystem operations belong on the server.
- Keep shared order/customer shapes and pure formatting/business helpers in `src/lib/types.ts`; keep DynamoDB persistence in `src/lib/db-dynamodb.ts`; keep S3 upload helpers in `src/lib/uploads.ts`.
- Use the `@/*` TypeScript alias for imports from `src/`.
- Preserve strict TypeScript typing, existing endpoint contracts, and accessible native controls. Surface failures to the user where the surrounding flow does so; do not silently pretend a failed save succeeded.
- Keep feature changes narrow: edit only the files needed for the behavior and its directly related tests/docs. Do not reformat or refactor unrelated areas.

## Change workflow for AI agents

1. Read this skill first to understand the project and locate likely files.
2. Translate the request into the smallest affected flow. Inspect only the relevant implementation, its direct callers, shared types/helpers, and any directly affected API/database contract. Do not scan every folder or file by default.
3. Before changing Next.js code, follow the repository's `AGENTS.md`: read the relevant guide under `node_modules/next/dist/docs/` for the API or behavior being changed, and heed deprecation notices. Do not assume generic Next.js conventions apply.
4. For database changes, inspect the affected query/mutation in `src/lib/db-dynamodb.ts` and preserve existing item shapes and behavior. Configure tables outside the application; do not create or seed production resources in code.
5. For API/client changes, update the route and the actual caller together when required; preserve JSON fields, status codes, and loading/error behavior.
6. Make the smallest complete change, add or adjust focused tests if a test setup exists, and update this skill only when durable project architecture or conventions change.
7. Verify with the smallest relevant check. Current package scripts are `npm run lint` and `npm run build`; `package.json` does not define a test script. Check the repository's package-manager lockfile before choosing install/run commands.
8. Review the final diff and confirm no secrets, runtime data, generated artifacts, or unrelated files were changed.

## Common validation

```powershell
npm run lint
npm run build
```

Run only checks appropriate to the change; documentation-only edits do not need a build unless a docs validation is added.
