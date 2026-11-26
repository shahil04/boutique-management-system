import postgres, { type ISql, type Sql } from "postgres";
import {
  BoutiqueOrder,
  CustomerSummary,
  EMPTY_MEASUREMENTS,
  Measurements,
  ORDER_STAGES,
  OrderInput,
  OrderStatus,
  ShopSettings,
  normalizePhoneKey,
} from "./types";

type DbRow = Record<string, unknown>;

let dbInstance: Sql | null = null;

function getDb(): Sql {
  const connectionString = process.env.SUPABASE_DB_URL?.trim();
  if (!connectionString) {
    throw new Error("SUPABASE_DB_URL is not configured.");
  }

  if (!dbInstance) {
    dbInstance = postgres(connectionString, {
      max: 1,
      prepare: false,
      ssl: "require",
      connect_timeout: 10,
    });
  }

  return dbInstance;
}

function parseJsonSafe<T>(raw: unknown, fallback: T): T {
  if (typeof raw === "string" && raw.trim()) {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  if (raw !== null && typeof raw === "object") return raw as T;
  return fallback;
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
    items: parseJsonSafe(row.items_json, []),
    total_amount: Number(row.total_amount ?? 0),
    advance_paid: Number(row.advance_paid ?? 0),
    balance_due: Number(row.balance_due ?? 0),
    slip_photo_url: String(row.slip_photo_url ?? ""),
    design_photos: parseJsonSafe(row.design_photos_json, []),
    ocr_raw_json: String(row.ocr_raw_json ?? ""),
    ocr_confidence:
      ocrConfidenceRaw === "ai_extracted" || ocrConfidenceRaw === "verified"
        ? ocrConfidenceRaw
        : "none",
    verified_by: String(row.verified_by ?? ""),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

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

async function resolveOrCreateCustomer(
  db: ISql,
  input: {
    customer_id?: number | null;
    customer_name: string;
    phone: string;
    address?: string;
  }
): Promise<number> {
  const now = new Date().toISOString();
  const cleanName = input.customer_name.trim();
  const cleanPhone = input.phone.trim();
  const phoneKey = normalizePhoneKey(cleanPhone);
  const cleanAddress = (input.address ?? "").trim();

  let existing: DbRow | undefined;

  if (input.customer_id && Number.isInteger(input.customer_id)) {
    const rows = await db<DbRow[]>`
      SELECT * FROM customers WHERE id = ${input.customer_id} LIMIT 1
    `;
    existing = rows[0];
  }

  if (!existing && phoneKey) {
    const rows = await db<DbRow[]>`
      SELECT * FROM customers WHERE phone_key = ${phoneKey} LIMIT 1
    `;
    existing = rows[0];
  }

  if (!existing && !phoneKey && cleanName) {
    const rows = await db<DbRow[]>`
      SELECT * FROM customers
      WHERE LOWER(TRIM(name)) = LOWER(${cleanName})
      LIMIT 1
    `;
    existing = rows[0];
  }

  if (existing) {
    const existingId = Number(existing.id);
    if (cleanAddress && !String(existing.address ?? "")) {
      await db`
        UPDATE customers SET address = ${cleanAddress}, updated_at = ${now}
        WHERE id = ${existingId}
      `;
    }
    return existingId;
  }

  const rows = await db<DbRow[]>`
    INSERT INTO customers (name, phone, phone_key, address, notes, created_at, updated_at)
    VALUES (${cleanName}, ${cleanPhone}, ${phoneKey}, ${cleanAddress}, '', ${now}, ${now})
    RETURNING id
  `;
  if (!rows[0]) throw new Error("Supabase did not return the new customer ID.");
  return Number(rows[0].id);
}

export async function listOrders(filters?: {
  q?: string;
  status?: string;
  due?: string;
}): Promise<BoutiqueOrder[]> {
  const rows = await getDb()<DbRow[]>`SELECT * FROM orders ORDER BY id DESC`;
  let orders = rows.map(mapOrderRow);

  const query = filters?.q?.trim().toLowerCase();
  if (query) {
    orders = orders.filter(
      (order) =>
        order.serial_no.toLowerCase().includes(query) ||
        order.customer_name.toLowerCase().includes(query) ||
        order.phone.toLowerCase().includes(query) ||
        order.garment_type.toLowerCase().includes(query)
    );
  }

  if (filters?.status && filters.status !== "All") {
    orders = orders.filter((order) => order.status === filters.status);
  }

  if (filters?.due) {
    const today = getTodayIso();
    if (filters.due === "today") {
      orders = orders.filter(
        (order) => order.delivery_date === today && order.status !== "Delivered"
      );
    } else if (filters.due === "overdue") {
      orders = orders.filter(
        (order) => order.delivery_date < today && order.status !== "Delivered"
      );
    } else if (filters.due === "upcoming") {
      const limit = addDaysIso(today, 3);
      orders = orders.filter(
        (order) =>
          order.delivery_date >= today &&
          order.delivery_date <= limit &&
          order.status !== "Delivered"
      );
    }
  }

  return orders;
}

export async function getOrderById(id: number): Promise<BoutiqueOrder | null> {
  const rows = await getDb()<DbRow[]>`
    SELECT * FROM orders WHERE id = ${id} LIMIT 1
  `;
  return rows[0] ? mapOrderRow(rows[0]) : null;
}

export async function getNextSerialNo(): Promise<string> {
  const rows = await getDb()<Array<{ serial_no: string }>>`
    SELECT serial_no FROM orders
  `;
  let maxNum = 678;
  for (const row of rows) {
    const num = parseInt(row.serial_no.replace(/\D/g, ""), 10);
    if (!Number.isNaN(num) && num > maxNum) maxNum = num;
  }
  return String(maxNum + 1);
}

export async function createOrder(input: OrderInput): Promise<BoutiqueOrder> {
  const db = getDb();
  const now = new Date().toISOString();
  const items = Array.isArray(input.items) ? input.items : [];
  const itemsTotal = items.reduce(
    (sum, item) => sum + (Number(item.amount) || 0),
    0
  );
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

  const created = await db.begin(async (tx) => {
    const customerId = await resolveOrCreateCustomer(tx, {
      customer_id: input.customer_id,
      customer_name: input.customer_name,
      phone: input.phone,
      address: input.address,
    });
    const rows = await tx<DbRow[]>`
      INSERT INTO orders (
        customer_id, serial_no, customer_name, phone, address, garment_type,
        order_date, delivery_date, status, measurements_json, items_json,
        total_amount, advance_paid, balance_due, slip_photo_url,
        design_photos_json, ocr_raw_json, ocr_confidence, verified_by,
        created_at, updated_at
      ) VALUES (
        ${customerId}, ${input.serial_no.trim()}, ${input.customer_name.trim()},
        ${input.phone.trim()}, ${(input.address ?? "").trim()},
        ${(input.garment_type ?? "").trim()}, ${input.order_date},
        ${input.delivery_date}, ${input.status ?? "Received"},
        ${JSON.stringify(measurements)}::jsonb, ${JSON.stringify(items)}::jsonb,
        ${totalAmount}, ${advancePaid}, ${balanceDue}, ${input.slip_photo_url ?? ""},
        ${JSON.stringify(input.design_photos ?? [])}::jsonb,
        ${input.ocr_raw_json ?? ""}, ${input.ocr_confidence ?? "none"},
        ${(input.verified_by ?? "").trim()}, ${now}, ${now}
      )
      RETURNING *
    `;
    if (!rows[0]) throw new Error("Supabase did not return the created order.");
    return rows[0];
  });

  return mapOrderRow(created);
}

export async function updateOrder(
  id: number,
  patch: Partial<OrderInput>
): Promise<BoutiqueOrder | null> {
  const existing = await getOrderById(id);
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

  const rows = await getDb()<DbRow[]>`
    UPDATE orders SET
      serial_no = ${(
        patch.serial_no ?? existing.serial_no
      ).trim()},
      customer_name = ${(patch.customer_name ?? existing.customer_name).trim()},
      phone = ${(patch.phone ?? existing.phone).trim()},
      address = ${(patch.address ?? existing.address).trim()},
      garment_type = ${(patch.garment_type ?? existing.garment_type).trim()},
      order_date = ${patch.order_date ?? existing.order_date},
      delivery_date = ${patch.delivery_date ?? existing.delivery_date},
      status = ${patch.status ?? existing.status},
      measurements_json = ${JSON.stringify(measurements)}::jsonb,
      items_json = ${JSON.stringify(items)}::jsonb,
      total_amount = ${totalAmount},
      advance_paid = ${advancePaid},
      balance_due = ${balanceDue},
      slip_photo_url = ${
        patch.slip_photo_url !== undefined
          ? patch.slip_photo_url
          : existing.slip_photo_url
      },
      design_photos_json = ${JSON.stringify(
        patch.design_photos !== undefined
          ? patch.design_photos
          : existing.design_photos
      )}::jsonb,
      ocr_raw_json = ${
        patch.ocr_raw_json !== undefined
          ? patch.ocr_raw_json
          : existing.ocr_raw_json
      },
      ocr_confidence = ${patch.ocr_confidence ?? existing.ocr_confidence},
      verified_by = ${(patch.verified_by ?? existing.verified_by).trim()},
      updated_at = ${now}
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] ? mapOrderRow(rows[0]) : null;
}

export async function deleteOrder(id: number): Promise<boolean> {
  const rows = await getDb()<Array<{ id: number }>>`
    DELETE FROM orders WHERE id = ${id} RETURNING id
  `;
  return rows.length > 0;
}

export async function listCustomers(): Promise<CustomerSummary[]> {
  const db = getDb();
  const [customerRows, orders] = await Promise.all([
    db<DbRow[]>`SELECT * FROM customers ORDER BY id DESC`,
    listOrders(),
  ]);
  const ordersByCustomer = new Map<number, BoutiqueOrder[]>();

  for (const order of orders) {
    if (order.customer_id !== null) {
      const customerOrders = ordersByCustomer.get(order.customer_id) ?? [];
      customerOrders.push(order);
      ordersByCustomer.set(order.customer_id, customerOrders);
    }
  }

  const summaries = customerRows.map((row): CustomerSummary => {
    const id = Number(row.id);
    const customerOrders = ordersByCustomer.get(id) ?? [];
    let totalSpent = 0;
    let pendingBalance = 0;
    let lastOrderDate = "";
    let latestMeasurements = { ...EMPTY_MEASUREMENTS };
    let latestSerialNo = "";

    for (const order of customerOrders) {
      totalSpent += order.total_amount;
      if (order.status !== "Delivered") pendingBalance += order.balance_due;
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
      order_count: customerOrders.length,
      total_spent: totalSpent,
      pending_balance: pendingBalance,
      last_order_date: lastOrderDate || String(row.created_at ?? "").slice(0, 10),
      latest_measurements: latestMeasurements,
      latest_serial_no: latestSerialNo,
      orders: customerOrders,
    };
  });

  return summaries.sort((a, b) =>
    b.last_order_date.localeCompare(a.last_order_date)
  );
}

export async function getCustomerById(
  id: number
): Promise<CustomerSummary | null> {
  return (await listCustomers()).find((customer) => customer.id === id) ?? null;
}

export async function updateCustomer(
  id: number,
  patch: {
    customer_name?: string;
    phone?: string;
    address?: string;
    notes?: string;
  }
): Promise<CustomerSummary | null> {
  const existing = await getCustomerById(id);
  if (!existing) return null;

  const now = new Date().toISOString();
  const nextName = (patch.customer_name ?? existing.customer_name).trim();
  const nextPhone = (patch.phone ?? existing.phone).trim();
  const nextAddress = (patch.address ?? existing.address).trim();
  const nextNotes = (patch.notes ?? existing.notes).trim();
  const db = getDb();

  await db.begin(async (tx) => {
    await tx`
      UPDATE customers
      SET name = ${nextName}, phone = ${nextPhone},
          phone_key = ${normalizePhoneKey(nextPhone)}, address = ${nextAddress},
          notes = ${nextNotes}, updated_at = ${now}
      WHERE id = ${id}
    `;
    await tx`
      UPDATE orders
      SET customer_name = ${nextName}, phone = ${nextPhone},
          address = ${nextAddress}, updated_at = ${now}
      WHERE customer_id = ${id}
    `;
  });

  return getCustomerById(id);
}

export async function getSettings(): Promise<ShopSettings> {
  const rows = await getDb()<Array<{ key: string; value: string }>>`
    SELECT key, value FROM settings
  `;
  const record = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    shop_name: record.shop_name ?? "Noor & Co. Boutique",
    shop_phone: record.shop_phone ?? "",
    shop_address: record.shop_address ?? "",
    default_unit: record.default_unit ?? "inches",
  };
}

export async function updateSettings(
  patch: Partial<ShopSettings>
): Promise<ShopSettings> {
  const allowed: (keyof ShopSettings)[] = [
    "shop_name",
    "shop_phone",
    "shop_address",
    "default_unit",
  ];
  const db = getDb();

  await db.begin(async (tx) => {
    for (const key of allowed) {
      if (patch[key] !== undefined) {
        await tx`
          INSERT INTO settings (key, value)
          VALUES (${key}, ${String(patch[key]).trim()})
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        `;
      }
    }
  });

  return getSettings();
}
