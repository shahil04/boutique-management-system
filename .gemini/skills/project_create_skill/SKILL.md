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
| **Deployment** | Runs locally only (no cloud hosting); SQLite + local file storage |

---

## 2. Tech Stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| **Framework** | Next.js (App Router) | 16.4.6 | Turbopack, `cacheComponents`, `partialPrefetching` |
| **Language** | TypeScript | ^5 | Strict mode, `bundler` module resolution |
| **UI** | React | 19.3.0 | Server Components + Client Components |
| **Styling** | Tailwind CSS | 4.3.3 | Via `@tailwindcss/turbopack` loader |
| **Icons** | lucide-react | ^1.80.0 | |
| **Database** | SQLite | Built-in `node:sqlite` | Node.js 24+ native module, WAL mode |
| **AI/OCR** | Google Gemini API | `@google/genai` ^3.6.1 | Vision OCR with structured JSON output |
| **Fonts** | Plus Jakarta Sans, Noto Sans Devanagari, Geist Mono | Google Fonts | Latin + Devanagari script support |

### Runtime Requirements
- **Node.js ≥ 24** (required for built-in `node:sqlite` — no npm SQLite packages needed)
- Custom type declarations at `src/types/node-sqlite.d.ts` (since `@types/node` doesn't cover `node:sqlite` yet)
- `next.config.ts` has `serverExternalPackages: ["node:sqlite"]` to prevent bundling

---

## 3. Environment Setup

### `.env.local` (gitignored — never commit)
```env
GEMINI_API_KEY=<your-gemini-api-key>
GEMINI_MODEL=gemini-3.5-flash
```

### `.env.example` (reference template)
```env
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash
```

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
├── next.config.ts                      # Next.js config (sqlite, turbopack, images)
├── package.json
├── tsconfig.json
├── data/                               # Runtime data (gitignored)
│   ├── boutique.db                     # SQLite database (auto-created on first run)
│   └── uploads/                        # Uploaded slip photos & sketches
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
│   │   ├── db.ts                       # SQLite database layer (CRUD, migrations, seed)
│   │   └── uploads.ts                  # File upload/serve utilities
│   └── types/
│       └── node-sqlite.d.ts            # Type declarations for Node.js built-in sqlite
└── .gemini/
    └── skills/
        └── project_create_skill/
            └── SKILL.md                # THIS FILE
```

---

## 5. Database Schema

The database is SQLite at `data/boutique.db`, auto-created on first run with WAL mode.

### Table: `orders`
| Column | Type | Default | Description |
|---|---|---|---|
| `id` | INTEGER PK | AUTOINCREMENT | Unique order ID |
| `customer_id` | INTEGER | NULL | FK to `customers.id` (auto-linked on create) |
| `serial_no` | TEXT NOT NULL | | Slip/bill number (e.g. "679") |
| `customer_name` | TEXT NOT NULL | | Customer name |
| `phone` | TEXT NOT NULL | | Phone number |
| `address` | TEXT | '' | Customer address |
| `garment_type` | TEXT | '' | e.g. "Anarkali Suit", "Blouse" |
| `order_date` | TEXT NOT NULL | | YYYY-MM-DD |
| `delivery_date` | TEXT NOT NULL | | YYYY-MM-DD |
| `status` | TEXT NOT NULL | 'Received' | One of: Received, Cutting, Stitching, Ready for Delivery, Delivered |
| `measurements_json` | TEXT NOT NULL | '{}' | JSON string of `Measurements` object |
| `items_json` | TEXT NOT NULL | '[]' | JSON array of `BillItem[]` |
| `total_amount` | REAL NOT NULL | 0 | Total in ₹ |
| `advance_paid` | REAL NOT NULL | 0 | Advance received in ₹ |
| `balance_due` | REAL NOT NULL | 0 | Remaining balance in ₹ |
| `slip_photo_url` | TEXT | '' | URL path to uploaded slip photo |
| `design_photos_json` | TEXT NOT NULL | '[]' | JSON array of `DesignPhoto[]` |
| `ocr_raw_json` | TEXT | '' | Raw OCR extraction JSON |
| `ocr_confidence` | TEXT | 'none' | 'none' \| 'ai_extracted' \| 'verified' |
| `verified_by` | TEXT | '' | Who verified the OCR data |
| `created_at` | TEXT NOT NULL | | ISO timestamp |
| `updated_at` | TEXT NOT NULL | | ISO timestamp |

**Indexes**: `serial_no`, `phone`, `status`, `delivery_date`, `customer_id`

### Table: `customers`
| Column | Type | Default | Description |
|---|---|---|---|
| `id` | INTEGER PK | AUTOINCREMENT | Unique customer ID |
| `name` | TEXT NOT NULL | | Customer name |
| `phone` | TEXT NOT NULL | | Phone number |
| `phone_key` | TEXT NOT NULL | '' | Normalized last-10-digits (for dedup matching) |
| `address` | TEXT | '' | Address |
| `notes` | TEXT | '' | Staff notes about the customer |
| `created_at` | TEXT NOT NULL | | ISO timestamp |
| `updated_at` | TEXT NOT NULL | | ISO timestamp |

**Index**: `phone_key`

### Table: `settings`
| Column | Type | Description |
|---|---|---|
| `key` | TEXT PK | Setting name |
| `value` | TEXT NOT NULL | Setting value |

**Default settings**: `shop_name`, `shop_phone`, `shop_address`, `default_unit`, `initial_seeded`

### Auto-Migration
On startup, `initSchema()` in `db.ts`:
1. Creates all tables if they don't exist
2. Checks if `orders` table has `customer_id` column — adds it via `ALTER TABLE` if missing
3. Inserts default settings (INSERT OR IGNORE)
4. Seeds 3 sample orders if DB is fresh (Neha Gupta #679, Priya Sharma #680, Aisha Khan #681)
5. Backfills `customer_id` for any orders missing it (creates customer records as needed)

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
- Generates a PDF from the complete receipt, including attached slip and design photos; supports device file sharing or download plus a WhatsApp draft

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

### Important ESLint Rules
- **No `setState` in `useEffect`** (`react-hooks/set-state-in-effect`): Initialize state from props directly, use `key` prop on modals
- **No `<img>` in Next.js** (`@next/next/no-img-element`): Use `next/image` or add eslint-disable comment for user-uploaded images
- **No unused variables**: Prefix with `_` if intentionally unused

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

Three sample orders created on first run (if DB is empty):
1. **#679 — Neha Gupta** (9876543210): Anarkali Suit, Ready for Delivery, ₹1,700, verified
2. **#680 — Priya Sharma** (9811223344): Bridal Padded Blouse, Stitching, ₹1,700
3. **#681 — Aisha Khan** (9910456789): Kurti & Straight Pant, Cutting, ₹1,250

Each has realistic Hindi+English measurements and billing items.

---

## 15. Troubleshooting & Known Issues

| Issue | Solution |
|---|---|
| `gemini-2.5-flash` returns 404 | Deprecated — use `gemini-3.5-flash` |
| `gemini-3.8-flash` returns 503 | High demand — fallback chain handles this automatically |
| OCR timeout / AbortError | 15s timeout; AbortError is retryable, next model in chain is tried |
| PowerShell `&&` invalid | Use `;` or `; if ($LASTEXITCODE -eq 0) { }` instead |
| Turbopack tracing warning | Add `/*turbopackIgnore: true*/` before `fs.readFileSync` path |
| No `@types/node` for `node:sqlite` | Custom declarations at `src/types/node-sqlite.d.ts` |
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
| Add a new DB table | `src/lib/db.ts` → `initSchema()`, `src/lib/types.ts` |
| Modify the dashboard UI | `src/components/BoutiqueApp.tsx` |
| Change WhatsApp message format | `src/lib/types.ts` → `buildWhatsAppMessage()` |
| Modify print receipt layout | `src/components/PrintReceiptModal.tsx` |
| Change theme colors | `src/app/globals.css` (CSS vars), component files (Tailwind classes) |
| Update shop default settings | `src/lib/db.ts` → `initSchema()` defaults |
| Add customer fields | `src/lib/types.ts` (CustomerSummary), `src/lib/db.ts` (customers table + migration), `src/components/CustomerDetailDrawer.tsx` |
