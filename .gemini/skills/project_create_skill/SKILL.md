---
name: boutique-shop-management
description: >
  Complete project context for BoutiqueFlow — an all-in-one boutique/tailoring shop management
  web app with AI Vision OCR (Gemini), Hindi+English bilingual support, returning customer
  deduplication, Kanban stage board, WhatsApp integration, and printable receipts.
  Read this skill file before adding or updating ANY feature so you can work without
  reading every source file.
---

# BoutiqueFlow — Project Context & Development Guide

> **Purpose**: This document is the single source of truth for any AI agent (or developer) working on this project. It describes the full architecture, every file, database schema, API surface, component hierarchy, business logic, design system, and conventions — so you can add or update features by referencing **only this file** without reading every source file first.

---

## 1. Project Overview

| Field | Value |
|---|---|
| **App Name** | BoutiqueFlow — Tailoring Slip OCR & Order Manager |
| **Domain** | Indian boutique / tailoring shop management |
| **Core Value** | Snap a photo of a handwritten tailoring slip → AI extracts Hindi & English text → staff verifies side-by-side → saves as searchable order with measurements, billing, & customer history |
| **Language** | Hindi + English bilingual (UI labels, OCR, WhatsApp messages) |
| **Currency** | Indian Rupee (₹), formatted via `Intl.NumberFormat("en-IN")` |
| **Target Users** | Boutique shop owners, tailors, staff (1-5 users, mobile-first) |
| **Deployment** | Next.js server deployment with AWS DynamoDB and private S3 storage |

---

## 2. Tech Stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| **Framework** | Next.js (App Router) | 16.4.6 | Turbopack, `cacheComponents`, `partialPrefetching` |
| **Language** | TypeScript | ^5 | Strict mode, `bundler` module resolution |
| **UI** | React | 19.3.0 | Server Components + Client Components |
| **Styling** | Tailwind CSS | 4.3.3 | Via `@tailwindcss/turbopack` loader |
| **Icons** | lucide-react | ^1.80.0 | |
| **Database** | AWS DynamoDB | `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb` | Configured orders, customers, and settings tables |
| **File storage** | AWS S3 | `@aws-sdk/client-s3` | Private image bucket, proxied through the app |
| **AI/OCR** | Google Gemini API | `@google/genai` ^3.6.1 | Vision OCR with structured JSON output |
| **Receipt PDF** | `html2canvas-pro` + `jspdf` | npm dependencies | Renders full receipt and attachments to PDF; supports modern CSS colors |
| **Fonts** | Plus Jakarta Sans, Noto Sans Devanagari, Geist Mono | Google Fonts | Latin + Devanagari script support |

### Runtime Requirements
- Configure `AWS_REGION`, `DYNAMODB_ORDERS_TABLE`, `DYNAMODB_CUSTOMERS_TABLE`, `DYNAMODB_SETTINGS_TABLE`, and `S3_BUCKET`.
- The AWS SDK uses the standard credential provider chain; prefer IAM roles for hosted deployments.
- The application does not use local database or upload fallbacks and does not create or seed DynamoDB tables.

---

## 3. Environment Setup

### `.env.local` (gitignored — never commit)
```env
GEMINI_API_KEY=<your-gemini-api-key>
GEMINI_MODEL=gemini-3.5-flash
WHATSAPP_ACCESS_TOKEN=<your-whatsapp-cloud-api-token>
WHATSAPP_PHONE_NUMBER_ID=<your-business-phone-number-id>
WHATSAPP_GRAPH_API_VERSION=v27.0
# Optional approved utility template with a document header:
WHATSAPP_RECEIPT_TEMPLATE_NAME=
WHATSAPP_RECEIPT_TEMPLATE_LANGUAGE=en
```

### `.env.example` (reference template)
```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash
AWS_REGION=
DYNAMODB_ORDERS_TABLE=
DYNAMODB_CUSTOMERS_TABLE=
DYNAMODB_SETTINGS_TABLE=
S3_BUCKET=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_GRAPH_API_VERSION=v27.0
WHATSAPP_RECEIPT_TEMPLATE_NAME=
WHATSAPP_RECEIPT_TEMPLATE_LANGUAGE=en
```

WhatsApp Cloud API tokens and phone-number IDs are server-only. Never prefix these variables with `NEXT_PUBLIC_` or expose their values in logs/client responses. Only send messages to customers who have opted in. Run this local-only app on a trusted device/network; do not expose its unauthenticated API to the public internet.

### Commands
```bash
npm install          # Install dependencies
npm run dev          # Start dev server (Turbopack)
npm run build        # Production build
npm run start        # Start production server
npm run lint         # ESLint check
npx tsc --noEmit     # TypeScript type check
```

---

## 4. Folder Structure

```
boutique_shop_management/
├── .env.local                          # Gemini API key (gitignored)
├── .env.example                        # Template for .env.local
├── .gitignore
├── AGENTS.md                           # Next.js agent rules (auto-generated)
├── next.config.ts                      # Next.js config (Turbopack, images)
├── package.json
├── tsconfig.json
├── src/
│   ├── app/
│   │   ├── globals.css                 # Tailwind imports + boutique theme CSS vars
│   │   ├── layout.tsx                  # Root layout (fonts, metadata)
│   │   ├── page.tsx                    # Home page (SSR → BoutiqueApp)
│   │   └── api/
│   │       ├── orders/
│   │       │   ├── route.ts            # GET (list+search), POST (create)
│   │       │   └── [id]/route.ts       # GET, PATCH, DELETE single order
│   │       ├── customers/
│   │       │   ├── route.ts            # GET (list all with order history)
│   │       │   └── [id]/route.ts       # GET, PATCH single customer
│   │       ├── ocr/route.ts            # POST — Gemini Vision OCR
│   │       ├── upload/route.ts         # POST — multipart or base64 image upload
│   │       ├── files/[...path]/route.ts # GET — serve uploaded images
│   │       └── settings/route.ts       # GET, PATCH shop settings
│   ├── components/
│   │   ├── BoutiqueApp.tsx             # Main dashboard (tabs, KPI, search, Kanban)
│   │   ├── OrderFormModal.tsx          # New/edit order modal (split-screen OCR + manual)
│   │   ├── OrderDetailDrawer.tsx       # Order detail slide-over drawer
│   │   ├── CustomerDetailDrawer.tsx    # Customer profile + order history drawer
│   │   ├── SlipCaptureViewer.tsx       # Camera/upload + zoom/rotate + OCR trigger
│   │   ├── NecklineSketchModal.tsx     # HTML5 canvas neckline drawing pad
│   │   └── PrintReceiptModal.tsx       # Printable tailoring slip/receipt
│   ├── lib/
│   │   ├── types.ts                    # All TypeScript types, constants, utility functions
│   │   ├── db.ts                       # DynamoDB persistence facade
│   │   ├── db-dynamodb.ts               # DynamoDB orders, customers, and settings
│   │   └── uploads.ts                  # File upload/serve utilities
└── .gemini/
    └── skills/
        └── project_create_skill/
            └── SKILL.md                # THIS FILE
```

---

## 5. DynamoDB and S3

The app uses three pre-created DynamoDB tables and one private S3 bucket. Set `AWS_REGION`, `DYNAMODB_ORDERS_TABLE`, `DYNAMODB_CUSTOMERS_TABLE`, `DYNAMODB_SETTINGS_TABLE`, and `S3_BUCKET` in `.env.local` or the deployment environment. The AWS identity needs DynamoDB `GetItem`, `PutItem`, `UpdateItem`, `DeleteItem`, and `Scan` access plus S3 `GetObject` and `PutObject`.

| Table | Partition key | Contents |
|---|---|---|
| Orders | `id` (Number) | Order records |
| Customers | `id` (Number) | Customer records |
| Settings | `key` (String) | Shop setting values and atomic order/customer ID counters |

The app uses the AWS SDK credential provider chain and never falls back to local files, SQLite, or Supabase. It does not create or seed tables. Existing SQLite/Supabase records and local uploads require a separate migration; no automatic migration occurs.

---

## 6. API Routes

### `GET /api/orders`
- **Query params**: `q` (search text), `status` (filter), `due` (today|overdue|upcoming)
- **Response**: `{ orders: BoutiqueOrder[], nextSerialNo: string }`

### `POST /api/orders`
- **Body**: `OrderInput` (required: `serial_no`, `customer_name`, `phone`, `order_date`, `delivery_date`)
- **Response**: `{ order: BoutiqueOrder }` (201)
- **Side effect**: Auto-creates or links to existing customer via `resolveOrCreateCustomer()`

### `GET /api/orders/[id]`
- **Response**: `{ order: BoutiqueOrder }`

### `PATCH /api/orders/[id]`
- **Body**: `Partial<OrderInput>`
- **Response**: `{ order: BoutiqueOrder }`
- **Auto-calculates**: `balance_due = total_amount - advance_paid` if not explicitly provided

### `DELETE /api/orders/[id]`
- **Response**: `{ deleted: true }`

### `GET /api/customers`
- **Response**: `{ customers: CustomerSummary[] }` — each includes full `orders[]` array, aggregated `total_spent`, `pending_balance`, `latest_measurements`, `latest_serial_no`

### `GET /api/customers/[id]`
- **Response**: `{ customer: CustomerSummary }`

### `PATCH /api/customers/[id]`
- **Body**: `{ customer_name?, phone?, address?, notes? }`
- **Response**: `{ customer: CustomerSummary }`
- **Side effect**: Cascades name/phone/address changes to ALL linked orders

### `POST /api/ocr`
- **Body**: `{ slipUrl?: string, imageBase64?: string, mimeType?: string }`
- **Headers**: Optional `x-gemini-api-key` (overrides env variable)
- **Response**: `{ extraction: OcrExtractionResult, model: string }`
- **Model fallback chain**: `gemini-3.5-flash` → `gemini-3.8-flash` → `gemini-3.5-flash-lite` → `gemini-3.1-flash-lite`
- **Retryable errors**: AbortError, timeout, 503, 404, 429

### `POST /api/orders/[id]/receipt`
- **Body**: Multipart `file` field containing a generated PDF (maximum 10 MB)
- **Behavior**: Resolves the order and recipient from the database, uploads the PDF to WhatsApp Cloud API media, then sends a document message to that order's phone number. The client cannot specify a different recipient.
- **Configuration**: Requires server-only `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`; optional Graph API version defaults to `v27.0`.
- **24-hour policy**: Without a configured template, the recipient must have an open 24-hour customer-service window. To send outside that window, configure an approved utility template with a document header using `WHATSAPP_RECEIPT_TEMPLATE_NAME` and `WHATSAPP_RECEIPT_TEMPLATE_LANGUAGE`.
- **Consent**: The customer must have opted in to WhatsApp messages before staff sends a receipt.
- **Media retention**: Uploaded Cloud API media may be retained by Meta for up to 30 days; consider this before sending sensitive order details.

### `POST /api/upload`
- **Body**: Multipart `file` field OR JSON `{ dataUrl: "data:image/...;base64,...", prefix?: string }`
- **Response**: `{ url: string, filename: string }`
- **Limit**: 12 MB max
- **Storage**: `data/uploads/<prefix>-<timestamp>-<uuid>.<ext>`

### `GET /api/files/[...path]`
- Serves files from `data/uploads/` with immutable cache headers
- Path-traversal protection via `path.resolve` check

### `GET /api/settings`
- **Response**: `{ settings: ShopSettings, hasEnvGeminiKey: boolean }`

### `PATCH /api/settings`
- **Body**: `Partial<ShopSettings>`
- **Response**: `{ settings: ShopSettings }`

---

## 7. Type System (`src/lib/types.ts`)

### Core Types
```typescript
OrderStatus = "Received" | "Cutting" | "Stitching" | "Ready for Delivery" | "Delivered"
OcrVerificationStatus = "none" | "ai_extracted" | "verified"

Measurements {
  length, chest, waist, hip, sleeve,
  front_neck, back_neck, border, shoulder, bottom,
  extra_notes  // string fields, e.g. '42"'
}

BillItem { description: string; amount: number }
DesignPhoto { url: string; label: string; kind: "sketch" | "fabric" | "reference" }

BoutiqueOrder {
  id, customer_id, serial_no, customer_name, phone, address,
  garment_type, order_date, delivery_date, status,
  measurements, items, total_amount, advance_paid, balance_due,
  slip_photo_url, design_photos, ocr_raw_json, ocr_confidence,
  verified_by, created_at, updated_at
}

OrderInput { /* Partial version for create/update */ }

CustomerSummary {
  id, key, customer_name, phone, address, notes,
  order_count, total_spent, pending_balance,
  last_order_date, latest_measurements, latest_serial_no,
  orders: BoutiqueOrder[]  // full order history
}

OcrExtractionResult {
  serial_no, customer_name, phone, address, garment_type,
  order_date, delivery_date, measurements, items,
  total_amount, advance_paid, balance_due,
  uncertain_fields, raw_text_summary
}

ShopSettings { shop_name, shop_phone, shop_address, default_unit }
```

### Constants
- `ORDER_STAGES` — ordered array of all 5 stages
- `EMPTY_MEASUREMENTS` — all fields as empty strings
- `MEASUREMENT_FIELDS` — metadata with English label, Hindi label, placeholder for each field

### Utility Functions
| Function | Purpose |
|---|---|
| `normalizePhoneKey(raw)` | Strips non-digits, returns last 10 digits (for customer dedup) |
| `normalizeIndianPhone(raw)` | Converts to `91XXXXXXXXXX` format for WhatsApp URLs |
| `formatINR(amount)` | Formats as `₹1,700` using Indian locale |
| `buildWhatsAppMessage(order, shopName, kind)` | Generates WhatsApp text for `"receipt"`, `"ready"`, or `"reminder"` |
| `buildWhatsAppUrl(phone, message)` | Returns `https://wa.me/91.../...` link |
| `getDeliveryUrgency(deliveryDate, status, today)` | Returns `"overdue" \| "today" \| "upcoming" \| "normal" \| "done"` |

---

## 8. Component Hierarchy & Data Flow

```
page.tsx (Server Component)
  └─ BoutiqueWorkspaceLoader (async SSR — fetches initial data)
       └─ BoutiqueApp (Client Component — main dashboard)
            ├─ OrderFormModal (new/edit order, split-screen)
            │    └─ SlipCaptureViewer (camera + OCR)
            │    └─ NecklineSketchModal (canvas drawing)
            ├─ OrderDetailDrawer (order details, stage pipeline)
            ├─ CustomerDetailDrawer (customer profile + history)
            └─ PrintReceiptModal (printable receipt)
```

### Data Flow
1. **SSR**: `page.tsx` calls `listOrders()`, `listCustomers()`, `getSettings()` server-side → passes as props to `BoutiqueApp`
2. **Client State**: `BoutiqueApp` holds `orders`, `customers`, `settings`, `nextSerialNo` in React state
3. **Mutations**: Components call `fetch("/api/...")` → on success, `BoutiqueApp.refreshData()` re-fetches both orders and customers
4. **Customer auto-linking**: When creating an order, `createOrder()` calls `resolveOrCreateCustomer()` which:
   - First tries to find by explicit `customer_id`
   - Then by normalized phone (last 10 digits)
   - Then by exact name match (case-insensitive) if no phone
   - Creates a new customer record if none found

### Component Details

#### `BoutiqueApp.tsx` (~1045 lines)
- **Tabs**: Orders, Customers, Settings
- **Orders Tab**: KPI cards (active, urgent, ready, pending balance), delivery alert banner, search bar, status filter chips, delivery date filter, list/board toggle
- **List View**: 2-column grid of order cards with measurement highlights, urgency badges, quick WhatsApp/print buttons
- **Board View**: 5-column Kanban (one per order stage)
- **Customers Tab**: Search, 3-column grid of customer cards with latest measurements, "History" and "Append Order" buttons
- **Settings Tab**: Shop profile form + Gemini API key configuration
- **State managed**: `orders`, `customers`, `settings`, `formOpen`, `editingOrder`, `prefillCustomer`, `prefillMeasurements`, `detailOrder`, `detailCustomerId`, `printOrder`, filters, search queries

#### `OrderFormModal.tsx`
- Split-screen: left = slip photo viewer (SlipCaptureViewer), right = form fields
- Returning customer dropdown (filtered by phone/name from `customers` prop)
- "Link & Append Order" banner when a returning customer is detected
- "Copy from past order" measurement selector (shows measurements from selected customer's history)
- Double-safety verification: AI OCR fills fields → staff manually verifies/corrects → marks as "verified"
- Fields: serial_no, customer_name, phone, address, garment_type, order_date, delivery_date, all measurements, bill items (dynamic add/remove), total/advance/balance

#### `SlipCaptureViewer.tsx`
- Camera modes: phone rear camera, webcam, file upload
- Controls: zoom, rotate, fullscreen, retake
- "✨ Extract via AI Vision" button → calls `/api/ocr` → fills form fields
- Shows uncertain fields highlighted for manual review

#### `OrderDetailDrawer.tsx`
- Full order details with stage pipeline visualization
- Status change buttons (advance to next stage)
- WhatsApp buttons (Send Receipt, Order Ready, Reminder)
- Edit, Delete, Print actions
- "Customer History" link (opens CustomerDetailDrawer)
- "Append New Order" for same customer

#### `CustomerDetailDrawer.tsx`
- Editable customer profile (name, phone, address, notes)
- "Save Profile" cascades changes to all linked orders
- Order history timeline with each order's garment, status, amounts
- Per-order "Append New Order + Copy Measurements" button
- Click any order to open OrderDetailDrawer

#### `NecklineSketchModal.tsx`
- HTML5 Canvas drawing pad with preset neck shape templates
- Saves sketch as base64 → uploads via `/api/upload` → adds to order's `design_photos`

#### `PrintReceiptModal.tsx`
- Formatted printable tailoring slip with shop branding
- CSS `@media print` rules hide non-print elements
- Shows measurements grid, itemized billing, payment summary
- Generates a PDF from the complete receipt, including attached slip and design photos, using `html2canvas-pro` and `jspdf`
- Sends the PDF directly to the order's saved WhatsApp number through `/api/orders/[id]/receipt`; download and print remain available

---

## 9. Gemini OCR Integration

### Prompt Strategy
- System role: "expert Indian boutique & tailoring slip OCR assistant"
- Handles Hindi (Devanagari), English, and Hinglish handwriting
- Extracts into structured JSON schema with strict field names
- `uncertain_fields` array flags ambiguous/faint handwriting for human review
- `raw_text_summary` provides verbatim transcription of key handwritten lines
- Dates converted to YYYY-MM-DD with year inference from context

### Response Schema
Uses `@google/genai` SDK's `config.responseMimeType: "application/json"` with `config.responseSchema` for guaranteed structured output. Temperature: 0.1 (low creativity, high accuracy).

### Model Fallback Chain
```
Primary (from GEMINI_MODEL env or "gemini-3.5-flash")
  → gemini-3.5-flash
  → gemini-3.8-flash
  → gemini-3.5-flash-lite
  → gemini-3.1-flash-lite
```
Retries on: AbortError, timeout, 503, 404, 429. Non-retryable errors (auth, bad request) throw immediately.

### Timeout
15 seconds per model attempt (`httpOptions.timeout: 15000`).

---

## 10. Key Business Logic

### Customer Deduplication (`resolveOrCreateCustomer()`)
1. If `customer_id` is provided and exists → use it
2. Else normalize phone to last 10 digits → search `customers.phone_key`
3. Else if no phone, match by `LOWER(TRIM(name))`
4. If found: return existing ID (and backfill address if empty)
5. If not found: INSERT new customer, return new ID

### Order Stage Pipeline
`Received` → `Cutting` → `Stitching` → `Ready for Delivery` → `Delivered`

Stage transitions are free-form (any stage to any stage via PATCH).

### Delivery Urgency
```
"done"     — status is "Delivered"
"overdue"  — delivery_date < today AND not delivered
"today"    — delivery_date == today AND not delivered
"upcoming" — delivery_date within next 2 days AND not delivered
"normal"   — everything else
```

### Balance Calculation
```
balance_due = total_amount - advance_paid  (auto-calculated if not explicitly set)
```

### WhatsApp Integration
Pre-formatted messages in three variants:
- **receipt**: Full digital tailoring slip with itemized charges
- **ready**: "Order Ready for Delivery" notification with balance info
- **reminder**: Status update with delivery date

Opens `https://wa.me/<91phone>?text=<encoded-message>` in new tab.

### Serial Number Auto-Increment
`getNextSerialNo()` scans all existing `serial_no` values, finds the max numeric value, returns `max + 1`.

---

## 11. Design System

### Color Palette
| Token | Hex | Usage |
|---|---|---|
| `--background` | `#faf7f2` | Page background (warm cream) |
| `--foreground` | `#1f1a1c` | Primary text |
| `--card` | `#ffffff` | Card backgrounds |
| `--accent` | `#5b1e31` | Primary buttons, badges, brand (deep maroon) |
| `--accent-soft` | `#f5e9ec` | Light accent backgrounds |
| `--gold` | `#b47b2b` | Gold accents (AI sparkle, currency) |
| `--border` | `#e6ddd0` | Borders, dividers |
| Secondary text | `#6d6265` | Muted labels |
| Hover text | `#4a4043` | Interactive muted text |

### Typography
- **Primary**: Plus Jakarta Sans (Latin, weights 400-700)
- **Devanagari**: Noto Sans Devanagari (Hindi text, weights 400-700)
- **Mono**: Geist Mono (code/serial numbers)

### Component Patterns
- Cards: `rounded-2xl border border-[#e6ddd0] bg-white p-4 shadow-xs`
- Buttons (primary): `rounded-xl bg-[#5b1e31] text-white hover:bg-[#471625]`
- Buttons (secondary): `rounded-xl border border-[#e6ddd0] bg-[#faf7f2] text-[#4a4043]`
- Inputs: `rounded-xl border border-[#e6ddd0] px-3 py-2 text-sm outline-none focus:border-[#5b1e31]`
- Badges: `rounded-full px-2.5 py-0.5 text-[11px] font-semibold`
- Stage badges use `STAGE_BADGE` color map per status

### Mobile-First Responsive Requirement
- This is a mobile-first app used by boutique staff on phones. Every new or changed user-facing feature must remain fully usable at narrow phone widths; responsiveness is a release requirement, not optional polish.
- Follow Tailwind's mobile-first approach: base classes must work on small screens, then use `sm:`, `md:`, and `lg:` to progressively enhance wider layouts.
- Keep forms, dialogs/drawers, navigation, cards, buttons, images, measurements, and billing readable and reachable on a phone. Allow appropriate wrapping/stacking and keep modal content and primary actions within the viewport.
- Do not hide important content or controls to fix mobile layout. Give tables and wide boards an intentional compact or scrollable treatment.
- After every UI change, check the page and each affected interactive surface at **360×800**, **390×844**, **768×1024**, and a desktop viewport such as **1366×768**. Include relevant open dialogs/drawers and the changed workflow, not only the initial page.
- At each viewport, check for document-level horizontal overflow, clipped or overlapping content, inaccessible primary actions, unreadable text, overflowing images, and unusable input controls. Fix regressions before finishing.
- Prefer a real browser at the target viewport sizes. If browser validation is unavailable, inspect responsive classes/layout carefully and state that runtime viewport verification was not performed; do not claim a responsive check passed without measuring it.

---

## 12. Conventions & Patterns for Adding Features

### Adding a New API Route
1. Create file at `src/app/api/<route>/route.ts`
2. Export named async functions: `GET`, `POST`, `PATCH`, `DELETE`
3. For dynamic routes: `src/app/api/<route>/[id]/route.ts` with `type RouteContext = { params: Promise<{ id: string }> }`
4. Always `await context.params` (Next.js 16 requirement)
5. Wrap in try/catch, return `NextResponse.json()`
6. Add database functions in `src/lib/db.ts`

### Adding a New Database Table
1. Add `CREATE TABLE IF NOT EXISTS` in `initSchema()` in `db.ts`
2. Add migration check for existing DBs (check column existence before `ALTER TABLE`)
3. Add TypeScript interface in `src/lib/types.ts`
4. Add CRUD functions in `src/lib/db.ts`
5. Create API route(s)

### Adding a New Component
1. Create in `src/components/`
2. Add `"use client"` directive at top for interactive components
3. Import types from `@/lib/types`
4. Follow the design system colors/patterns above
5. Wire into `BoutiqueApp.tsx` (state + render + modal/drawer management)
6. For modals: use React `key` prop for re-initialization instead of `useEffect` reset
7. Verify mobile responsiveness at every viewport listed in [Mobile-First Responsive Requirement](#mobile-first-responsive-requirement), including the new component's open/active state

### Important ESLint Rules
- **No `setState` in `useEffect`** (`react-hooks/set-state-in-effect`): Initialize state from props directly, use `key` prop on modals
- **No `<img>` in Next.js** (`@next/next/no-img-element`): Use `next/image` or add eslint-disable comment for user-uploaded images
- **No unused variables**: Prefix with `_` if intentionally unused

### UI Change Validation
For every UI feature or layout update:
1. Run through the changed user journey in a browser at 360×800, 390×844, 768×1024, and 1366×768.
2. Measure `document.documentElement.scrollWidth` against the viewport width at each size; there must be no unexpected horizontal page scrolling.
3. Open and inspect any affected modal, drawer, menu, or other interactive state on mobile sizes.
4. Confirm essential details and actions remain visible, text wraps, and controls can be comfortably used without clipping or overlap.
5. Fix any issues found before reporting the change complete.

### Next.js 16 Specifics
- Root layout uses `LayoutProps<"/">` type
- Use `connection()` from `next/server` for dynamic SSR opt-in
- Route handler params are `Promise<{...}>` — always `await`
- Read Next.js docs at `node_modules/next/dist/docs/` before using new APIs (per AGENTS.md rule)

### Turbopack Notes
- Dynamic `fs.readFileSync` causes whole-project tracing warning
- Fix with `/*turbopackIgnore: true*/` comment before the path argument

### File Upload Pattern
1. Client captures/selects image
2. POST to `/api/upload` (multipart or base64)
3. Returns `{ url: "/api/files/<filename>" }`
4. Store the URL in order fields (`slip_photo_url` or `design_photos`)
5. Images served via `/api/files/[...path]` with immutable caching

---

## 13. Returning Customer Feature

When the same customer comes again:

### Detection
- In `OrderFormModal`: select an existing customer, or detect a match while entering the new order
- Match by exact normalized phone number (last 10 digits); match by exact name only when no phone number is entered
- Do not match partial phone numbers or use a name match when a different phone number is present

### Flow
1. Staff selects existing customer from dropdown → "Link & Append Order" banner appears
2. Customer info (name, phone, address) pre-filled from customer record
3. Staff enters the new garment, measurements, and billing; these belong to the new order and do not overwrite previous orders
4. Staff can optionally copy measurements from a past order
5. On save → `createOrder()` → `resolveOrCreateCustomer()` → links the new order to the existing customer history

### Customer Profile Updates
- Editing customer via `PATCH /api/customers/[id]` cascades name/phone/address to ALL linked orders
- Each customer has a `notes` field for staff comments

### Customer Directory
- Customers tab shows all customers with latest measurements, order count, total spent
- Click to open `CustomerDetailDrawer` with full order history timeline
- "Append New Order + Copy Measurements" button per past order

---

## 14. Seed Data

No sample customer or order records are created. New numeric IDs are allocated with atomic counters in the settings table.

---

## 15. Troubleshooting & Known Issues

| Issue | Solution |
|---|---|
| `gemini-2.5-flash` returns 404 | Deprecated — use `gemini-3.5-flash` |
| `gemini-3.8-flash` returns 503 | High demand — fallback chain handles this automatically |
| OCR timeout / AbortError | 15s timeout; AbortError is retryable, next model in chain is tried |
| PowerShell `&&` invalid | Use `;` or `; if ($LASTEXITCODE -eq 0) { }` instead |
| Turbopack tracing warning | Add `/*turbopackIgnore: true*/` before `fs.readFileSync` path |
| AWS resource access denied | Verify the configured table/bucket names, region, and IAM permissions |
| `setState` in `useEffect` ESLint error | Use `key` prop on modal components for re-initialization |

---

## 16. What This Project Does NOT Include (Future Scope)

- Cloud deployment / hosting
- User authentication / multi-user accounts
- Offline / PWA support
- Backup / export of database
- Analytics / reporting dashboard
- Multi-language UI toggle (currently hardcoded Hindi+English mix)
- Inventory / fabric stock management
- Payment gateway integration
- SMS notifications (only WhatsApp currently)
- Image optimization via `next/image` (disabled; user uploads are served raw)

---

## 17. Quick Reference — File to Edit for Common Tasks

| Task | File(s) to Edit |
|---|---|
| Add a new measurement field | `src/lib/types.ts` (Measurements, MEASUREMENT_FIELDS, EMPTY_MEASUREMENTS), `src/app/api/ocr/route.ts` (schema) |
| Add a new order status/stage | `src/lib/types.ts` (OrderStatus, ORDER_STAGES), `src/components/BoutiqueApp.tsx` (STAGE_BADGE) |
| Change OCR prompt | `src/app/api/ocr/route.ts` → `buildOcrPrompt()` |
| Add a new API endpoint | `src/app/api/<route>/route.ts`, `src/lib/db.ts` (if DB needed) |
| Add a new DB table | Provision it in AWS, update `.env.example` and `src/lib/db-dynamodb.ts` |
| Modify the dashboard UI | `src/components/BoutiqueApp.tsx` |
| Change WhatsApp message format | `src/lib/types.ts` → `buildWhatsAppMessage()` |
| Modify print receipt layout | `src/components/PrintReceiptModal.tsx` |
| Send receipt PDF via WhatsApp Cloud API | `src/components/PrintReceiptModal.tsx`, `src/app/api/orders/[id]/receipt/route.ts`, server environment variables |
| Change theme colors | `src/app/globals.css` (CSS vars), component files (Tailwind classes) |
| Update shop default settings | `src/lib/db-dynamodb.ts` → `DEFAULT_SETTINGS` |
| Add customer fields | `src/lib/types.ts` (`CustomerSummary`), `src/lib/db-dynamodb.ts`, `src/components/CustomerDetailDrawer.tsx` |
