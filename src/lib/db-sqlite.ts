import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  BillItem,
  BoutiqueOrder,
  CustomerSummary,
  DesignPhoto,
  EMPTY_MEASUREMENTS,
  Measurements,
  ORDER_STAGES,
  OcrVerificationStatus,
  OrderInput,
  OrderStatus,
  ShopSettings,
  normalizePhoneKey,
} from "./types";

// Local development adapter; production persistence is provided by Supabase.
const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "boutique.db");

type DbRow = Record<string, unknown>;

let dbInstance: DatabaseSync | null = null;

function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysIso(baseIso: string, days: number): string {
  const date = new Date(`${baseIso}T00:00:00`);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseJsonSafe<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string" || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function mapOrderRow(row: DbRow): BoutiqueOrder {
  const parsedMeasurements = parseJsonSafe<Partial<Measurements>>(
    row.measurements_json,
    {}
  );
  const statusRaw = String(row.status ?? "Received");
  const status: OrderStatus = ORDER_STAGES.includes(statusRaw as OrderStatus)
    ? (statusRaw as OrderStatus)
    : "Received";
  const ocrConfidenceRaw = String(row.ocr_confidence ?? "none");
  const ocr_confidence: OcrVerificationStatus =
    ocrConfidenceRaw === "ai_extracted" || ocrConfidenceRaw === "verified"
      ? ocrConfidenceRaw
      : "none";

  return {
    id: Number(row.id),
    customer_id:
      row.customer_id !== null && row.customer_id !== undefined
        ? Number(row.customer_id)
        : null,
    serial_no: String(row.serial_no ?? ""),
    customer_name: String(row.customer_name ?? ""),
    phone: String(row.phone ?? ""),
    address: String(row.address ?? ""),
    garment_type: String(row.garment_type ?? ""),
    order_date: String(row.order_date ?? ""),
    delivery_date: String(row.delivery_date ?? ""),
    status,
    measurements: { ...EMPTY_MEASUREMENTS, ...parsedMeasurements },
    items: parseJsonSafe<BillItem[]>(row.items_json, []),
    total_amount: Number(row.total_amount ?? 0),
    advance_paid: Number(row.advance_paid ?? 0),
    balance_due: Number(row.balance_due ?? 0),
    slip_photo_url: String(row.slip_photo_url ?? ""),
    design_photos: parseJsonSafe<DesignPhoto[]>(row.design_photos_json, []),
    ocr_raw_json: String(row.ocr_raw_json ?? ""),
    ocr_confidence,
    verified_by: String(row.verified_by ?? ""),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function initSchema(db: DatabaseSync) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      serial_no TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT DEFAULT '',
      garment_type TEXT DEFAULT '',
      order_date TEXT NOT NULL,
      delivery_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Received',
      measurements_json TEXT NOT NULL DEFAULT '{}',
      items_json TEXT NOT NULL DEFAULT '[]',
      total_amount REAL NOT NULL DEFAULT 0,
      advance_paid REAL NOT NULL DEFAULT 0,
      balance_due REAL NOT NULL DEFAULT 0,
      slip_photo_url TEXT DEFAULT '',
      design_photos_json TEXT NOT NULL DEFAULT '[]',
      ocr_raw_json TEXT DEFAULT '',
      ocr_confidence TEXT DEFAULT 'none',
      verified_by TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orders_serial_no ON orders(serial_no);
    CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON orders(delivery_date);

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      phone_key TEXT NOT NULL DEFAULT '',
      address TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_customers_phone_key ON customers(phone_key);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const orderCols = db
    .prepare("PRAGMA table_info(orders)")
    .all() as DbRow[];
  const hasCustomerId = orderCols.some((c) => c.name === "customer_id");
  if (!hasCustomerId) {
    db.exec("ALTER TABLE orders ADD COLUMN customer_id INTEGER;");
  }
  db.exec(
    "CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);"
  );

  const defaults: Record<string, string> = {
    shop_name: "Noor & Co. Boutique",
    shop_phone: "+91 98100 00000",
    shop_address: "Main Market, Boutique Lane",
    default_unit: "inches",
  };

  const insertSetting = db.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)"
  );
  for (const [k, v] of Object.entries(defaults)) {
    insertSetting.run(k, v);
  }

  const seeded = db
    .prepare("SELECT value FROM settings WHERE key = 'initial_seeded'")
    .get();
  const countRow = db.prepare("SELECT COUNT(*) AS cnt FROM orders").get();
  const orderCount = Number(countRow?.cnt ?? 0);

  if (!seeded && orderCount === 0) {
    const today = getTodayIso();
    const nowIso = new Date().toISOString();
    const sampleOrders: OrderInput[] = [
      {
        serial_no: "679",
        customer_name: "Neha Gupta",
        phone: "9876543210",
        address: "Sector 14, Saket",
        garment_type: "Anarkali Suit & Dupatta",
        order_date: addDaysIso(today, -3),
        delivery_date: today,
        status: "Ready for Delivery",
        measurements: {
          length: '44"',
          chest: '36"',
          waist: '30"',
          hip: '39"',
          sleeve: '16" (3/4th)',
          front_neck: '6.5" Sweetheart',
          back_neck: '8.5" Deep + Dori',
          border: "Golden Zari + Gotta Patti",
          shoulder: '14.5"',
          bottom: '14" Churidar',
          extra_notes: "बाजू पर पतली पाइपिंग लगाएं, अस्तर कॉटन का रहेगा।",
        },
        items: [
          { description: "Anarkali Suit Stitching", amount: 1200 },
          { description: "Cotton Lining (अस्तर)", amount: 300 },
          { description: "Zari Border & Tassels (लटकन)", amount: 200 },
        ],
        total_amount: 1700,
        advance_paid: 700,
        balance_due: 1000,
        ocr_confidence: "verified",
        verified_by: "Master Ji",
      },
      {
        serial_no: "680",
        customer_name: "Priya Sharma",
        phone: "9811223344",
        address: "Model Town, Block B",
        garment_type: "Bridal Padded Blouse",
        order_date: addDaysIso(today, -1),
        delivery_date: addDaysIso(today, 2),
        status: "Stitching",
        measurements: {
          length: '14.5"',
          chest: '34"',
          waist: '28"',
          hip: "",
          sleeve: '10.5"',
          front_neck: '7" Princess Cut',
          back_neck: '9.5" Boat + Keyhole',
          border: "Heavy Magzi & Latkan",
          shoulder: '14"',
          bottom: "",
          extra_notes: "Back hook, padded cups size 34, heavy magzi finishing.",
        },
        items: [
          { description: "Padded Princess Blouse", amount: 1450 },
          { description: "Handcrafted Latkan", amount: 250 },
        ],
        total_amount: 1700,
        advance_paid: 1000,
        balance_due: 700,
        ocr_confidence: "none",
        verified_by: "Ritu",
      },
      {
        serial_no: "681",
        customer_name: "Aisha Khan",
        phone: "9910456789",
        address: "Civil Lines",
        garment_type: "Kurti & Straight Pant",
        order_date: today,
        delivery_date: addDaysIso(today, 4),
        status: "Cutting",
        measurements: {
          length: '41"',
          chest: '38"',
          waist: '33"',
          hip: '41"',
          sleeve: '17"',
          front_neck: '6" Collar V',
          back_neck: '3.5" Closed',
          border: "Lace on Hem & Sleeve",
          shoulder: '15"',
          bottom: '37" Pant, 13" Mohri',
          extra_notes: "Side pockets in pant, front slit 12 inch.",
        },
        items: [
          { description: "Kurti + Pant Stitching", amount: 1100 },
          { description: "Organza Lace", amount: 150 },
        ],
        total_amount: 1250,
        advance_paid: 500,
        balance_due: 750,
        ocr_confidence: "none",
        verified_by: "",
      },
    ];

    const insertOrderStmt = db.prepare(`
      INSERT INTO orders (
        serial_no, customer_name, phone, address, garment_type,
        order_date, delivery_date, status, measurements_json, items_json,
        total_amount, advance_paid, balance_due, slip_photo_url,
        design_photos_json, ocr_raw_json, ocr_confidence, verified_by,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const order of sampleOrders) {
      insertOrderStmt.run(
        order.serial_no,
        order.customer_name,
        order.phone,
        order.address ?? "",
        order.garment_type ?? "",
        order.order_date,
        order.delivery_date,
        order.status ?? "Received",
        JSON.stringify({ ...EMPTY_MEASUREMENTS, ...(order.measurements ?? {}) }),
        JSON.stringify(order.items ?? []),
        order.total_amount ?? 0,
        order.advance_paid ?? 0,
        order.balance_due ?? 0,
        order.slip_photo_url ?? "",
        JSON.stringify(order.design_photos ?? []),
        order.ocr_raw_json ?? "",
        order.ocr_confidence ?? "none",
        order.verified_by ?? "",
        nowIso,
        nowIso
      );
    }
    insertSetting.run("initial_seeded", "1");
  }

  // Backfill customer records for any existing orders without customer_id
  const unlinkedOrders = db
    .prepare(
      "SELECT id, customer_name, phone, address FROM orders WHERE customer_id IS NULL ORDER BY id ASC"
    )
    .all() as DbRow[];
  const linkStmt = db.prepare("UPDATE orders SET customer_id = ? WHERE id = ?");
  for (const row of unlinkedOrders) {
    const cid = resolveOrCreateCustomer(db, {
      customer_name: String(row.customer_name ?? ""),
      phone: String(row.phone ?? ""),
      address: String(row.address ?? ""),
    });
    linkStmt.run(cid, Number(row.id));
  }
}

function resolveOrCreateCustomer(
  db: DatabaseSync,
  input: {
    customer_id?: number | null;
    customer_name: string;
    phone: string;
    address?: string;
  }
): number {
  const now = new Date().toISOString();
  const cleanName = input.customer_name.trim();
  const cleanPhone = input.phone.trim();
  const phoneKey = normalizePhoneKey(cleanPhone);
  const cleanAddress = (input.address ?? "").trim();

  let existing: DbRow | undefined;

  if (input.customer_id && Number.isInteger(input.customer_id)) {
    existing = db
      .prepare("SELECT * FROM customers WHERE id = ?")
      .get(input.customer_id) as DbRow | undefined;
  }

  if (!existing && phoneKey) {
    existing = db
      .prepare("SELECT * FROM customers WHERE phone_key = ? LIMIT 1")
      .get(phoneKey) as DbRow | undefined;
  }

  if (!existing && !phoneKey && cleanName) {
    existing = db
      .prepare("SELECT * FROM customers WHERE LOWER(TRIM(name)) = LOWER(?) LIMIT 1")
      .get(cleanName) as DbRow | undefined;
  }

  if (existing) {
    const existingId = Number(existing.id);
    const existingAddress = String(existing.address ?? "");
    if (cleanAddress && !existingAddress) {
      db.prepare(
        "UPDATE customers SET address = ?, updated_at = ? WHERE id = ?"
      ).run(cleanAddress, now, existingId);
    }
    return existingId;
  }

  const inserted = db
    .prepare(
      `
      INSERT INTO customers (name, phone, phone_key, address, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, '', ?, ?)
    `
    )
    .run(cleanName, cleanPhone, phoneKey, cleanAddress, now, now);

  return Number(inserted.lastInsertRowid);
}

export function getDb(): DatabaseSync {
  if (!dbInstance) {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    dbInstance = new DatabaseSync(DB_PATH);
    initSchema(dbInstance);
  }
  return dbInstance;
}

export function listOrders(filters?: {
  q?: string;
  status?: string;
  due?: string;
}): BoutiqueOrder[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM orders ORDER BY id DESC")
    .all() as DbRow[];
  let orders = rows.map(mapOrderRow);

  const query = filters?.q?.trim().toLowerCase();
  if (query) {
    orders = orders.filter(
      (o) =>
        o.serial_no.toLowerCase().includes(query) ||
        o.customer_name.toLowerCase().includes(query) ||
        o.phone.toLowerCase().includes(query) ||
        o.garment_type.toLowerCase().includes(query)
    );
  }

  if (filters?.status && filters.status !== "All") {
    orders = orders.filter((o) => o.status === filters.status);
  }

  if (filters?.due) {
    const today = getTodayIso();
    if (filters.due === "today") {
      orders = orders.filter(
        (o) => o.delivery_date === today && o.status !== "Delivered"
      );
    } else if (filters.due === "overdue") {
      orders = orders.filter(
        (o) => o.delivery_date < today && o.status !== "Delivered"
      );
    } else if (filters.due === "upcoming") {
      const limit = addDaysIso(today, 3);
      orders = orders.filter(
        (o) =>
          o.delivery_date >= today &&
          o.delivery_date <= limit &&
          o.status !== "Delivered"
      );
    }
  }

  return orders;
}

export function getOrderById(id: number): BoutiqueOrder | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM orders WHERE id = ?")
    .get(id) as DbRow | undefined;
  return row ? mapOrderRow(row) : null;
}

export function getNextSerialNo(): string {
  const db = getDb();
  const rows = db.prepare("SELECT serial_no FROM orders").all() as DbRow[];
  let maxNum = 678;
  for (const r of rows) {
    const num = parseInt(String(r.serial_no ?? "").replace(/\D/g, ""), 10);
    if (!Number.isNaN(num) && num > maxNum) {
      maxNum = num;
    }
  }
  return String(maxNum + 1);
}

export function createOrder(input: OrderInput): BoutiqueOrder {
  const db = getDb();
  const now = new Date().toISOString();
  const items = Array.isArray(input.items) ? input.items : [];
  const itemsTotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const totalAmount =
    input.total_amount !== undefined && input.total_amount !== null
      ? Number(input.total_amount) || 0
      : itemsTotal;
  const advancePaid = Number(input.advance_paid ?? 0) || 0;
  const balanceDue =
    input.balance_due !== undefined && input.balance_due !== null
      ? Number(input.balance_due)
      : Math.max(0, totalAmount - advancePaid);

  const measurements: Measurements = {
    ...EMPTY_MEASUREMENTS,
    ...(input.measurements ?? {}),
  };

  const customerId = resolveOrCreateCustomer(db, {
    customer_id: input.customer_id,
    customer_name: input.customer_name,
    phone: input.phone,
    address: input.address,
  });

  const result = db
    .prepare(
      `
      INSERT INTO orders (
        customer_id, serial_no, customer_name, phone, address, garment_type,
        order_date, delivery_date, status, measurements_json, items_json,
        total_amount, advance_paid, balance_due, slip_photo_url,
        design_photos_json, ocr_raw_json, ocr_confidence, verified_by,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      customerId,
      input.serial_no.trim(),
      input.customer_name.trim(),
      input.phone.trim(),
      (input.address ?? "").trim(),
      (input.garment_type ?? "").trim(),
      input.order_date,
      input.delivery_date,
      input.status ?? "Received",
      JSON.stringify(measurements),
      JSON.stringify(items),
      totalAmount,
      advancePaid,
      balanceDue,
      input.slip_photo_url ?? "",
      JSON.stringify(input.design_photos ?? []),
      input.ocr_raw_json ?? "",
      input.ocr_confidence ?? "none",
      (input.verified_by ?? "").trim(),
      now,
      now
    );

  return getOrderById(Number(result.lastInsertRowid))!;
}

export function updateOrder(
  id: number,
  patch: Partial<OrderInput>
): BoutiqueOrder | null {
  const existing = getOrderById(id);
  if (!existing) return null;

  const items = patch.items !== undefined ? patch.items : existing.items;
  const totalAmount =
    patch.total_amount !== undefined
      ? Number(patch.total_amount) || 0
      : existing.total_amount;
  const advancePaid =
    patch.advance_paid !== undefined
      ? Number(patch.advance_paid) || 0
      : existing.advance_paid;
  const balanceDue =
    patch.balance_due !== undefined
      ? Number(patch.balance_due)
      : Math.max(0, totalAmount - advancePaid);

  const measurements: Measurements = {
    ...existing.measurements,
    ...(patch.measurements ?? {}),
  };

  const now = new Date().toISOString();
  const db = getDb();
  db.prepare(
    `
    UPDATE orders SET
      serial_no = ?,
      customer_name = ?,
      phone = ?,
      address = ?,
      garment_type = ?,
      order_date = ?,
      delivery_date = ?,
      status = ?,
      measurements_json = ?,
      items_json = ?,
      total_amount = ?,
      advance_paid = ?,
      balance_due = ?,
      slip_photo_url = ?,
      design_photos_json = ?,
      ocr_raw_json = ?,
      ocr_confidence = ?,
      verified_by = ?,
      updated_at = ?
    WHERE id = ?
  `
  ).run(
    (patch.serial_no ?? existing.serial_no).trim(),
    (patch.customer_name ?? existing.customer_name).trim(),
    (patch.phone ?? existing.phone).trim(),
    (patch.address ?? existing.address).trim(),
    (patch.garment_type ?? existing.garment_type).trim(),
    patch.order_date ?? existing.order_date,
    patch.delivery_date ?? existing.delivery_date,
    patch.status ?? existing.status,
    JSON.stringify(measurements),
    JSON.stringify(items),
    totalAmount,
    advancePaid,
    balanceDue,
    patch.slip_photo_url !== undefined
      ? patch.slip_photo_url
      : existing.slip_photo_url,
    JSON.stringify(
      patch.design_photos !== undefined
        ? patch.design_photos
        : existing.design_photos
    ),
    patch.ocr_raw_json !== undefined
      ? patch.ocr_raw_json
      : existing.ocr_raw_json,
    patch.ocr_confidence ?? existing.ocr_confidence,
    (patch.verified_by ?? existing.verified_by).trim(),
    now,
    id
  );

  return getOrderById(id);
}

export function deleteOrder(id: number): boolean {
  const db = getDb();
  const res = db.prepare("DELETE FROM orders WHERE id = ?").run(id);
  return Number(res.changes) > 0;
}

export function listCustomers(): CustomerSummary[] {
  const db = getDb();
  const customerRows = db
    .prepare("SELECT * FROM customers ORDER BY id DESC")
    .all() as DbRow[];
  const orders = listOrders();

  const ordersByCustomer = new Map<number, BoutiqueOrder[]>();
  for (const order of orders) {
    if (order.customer_id !== null) {
      const list = ordersByCustomer.get(order.customer_id) ?? [];
      list.push(order);
      ordersByCustomer.set(order.customer_id, list);
    }
  }

  const summaries: CustomerSummary[] = customerRows.map((row) => {
    const id = Number(row.id);
    const custOrders = ordersByCustomer.get(id) ?? [];
    let totalSpent = 0;
    let pendingBalance = 0;
    let lastOrderDate = "";
    let latestMeasurements = { ...EMPTY_MEASUREMENTS };
    let latestSerialNo = "";

    // custOrders are ordered id DESC (newest first)
    for (const order of custOrders) {
      totalSpent += order.total_amount;
      if (order.status !== "Delivered") {
        pendingBalance += order.balance_due;
      }
      if (!lastOrderDate || order.order_date > lastOrderDate) {
        lastOrderDate = order.order_date;
        latestMeasurements = order.measurements;
        latestSerialNo = order.serial_no;
      }
    }

    const phone = String(row.phone ?? "");
    const name = String(row.name ?? "");
    return {
      id,
      key: normalizePhoneKey(phone) || name.trim().toLowerCase() || String(id),
      customer_name: name,
      phone,
      address: String(row.address ?? ""),
      notes: String(row.notes ?? ""),
      order_count: custOrders.length,
      total_spent: totalSpent,
      pending_balance: pendingBalance,
      last_order_date: lastOrderDate || String(row.created_at ?? "").slice(0, 10),
      latest_measurements: latestMeasurements,
      latest_serial_no: latestSerialNo,
      orders: custOrders,
    };
  });

  return summaries.sort((a, b) =>
    b.last_order_date.localeCompare(a.last_order_date)
  );
}

export function getCustomerById(id: number): CustomerSummary | null {
  return listCustomers().find((c) => c.id === id) ?? null;
}

export function updateCustomer(
  id: number,
  patch: {
    customer_name?: string;
    phone?: string;
    address?: string;
    notes?: string;
  }
): CustomerSummary | null {
  const existing = getCustomerById(id);
  if (!existing) return null;

  const db = getDb();
  const now = new Date().toISOString();
  const nextName = (patch.customer_name ?? existing.customer_name).trim();
  const nextPhone = (patch.phone ?? existing.phone).trim();
  const nextPhoneKey = normalizePhoneKey(nextPhone);
  const nextAddress = (patch.address ?? existing.address).trim();
  const nextNotes = (patch.notes ?? existing.notes).trim();

  db.prepare(
    `
    UPDATE customers
    SET name = ?, phone = ?, phone_key = ?, address = ?, notes = ?, updated_at = ?
    WHERE id = ?
  `
  ).run(nextName, nextPhone, nextPhoneKey, nextAddress, nextNotes, now, id);

  db.prepare(
    `
    UPDATE orders
    SET customer_name = ?, phone = ?, address = ?, updated_at = ?
    WHERE customer_id = ?
  `
  ).run(nextName, nextPhone, nextAddress, now, id);

  return getCustomerById(id);
}

export function getSettings(): ShopSettings {
  const db = getDb();
  const rows = db.prepare("SELECT key, value FROM settings").all() as DbRow[];
  const record: Record<string, string> = {};
  for (const r of rows) {
    record[String(r.key)] = String(r.value);
  }
  return {
    shop_name: record.shop_name ?? "Noor & Co. Boutique",
    shop_phone: record.shop_phone ?? "",
    shop_address: record.shop_address ?? "",
    default_unit: record.default_unit ?? "inches",
  };
}

export function updateSettings(patch: Partial<ShopSettings>): ShopSettings {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  );
  const allowed: (keyof ShopSettings)[] = [
    "shop_name",
    "shop_phone",
    "shop_address",
    "default_unit",
  ];
  for (const key of allowed) {
    if (patch[key] !== undefined) {
      stmt.run(key, String(patch[key]).trim());
    }
  }
  return getSettings();
}
