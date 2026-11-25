export type OrderStatus =
  | "Received"
  | "Cutting"
  | "Stitching"
  | "Ready for Delivery"
  | "Delivered";

export const ORDER_STAGES: OrderStatus[] = [
  "Received",
  "Cutting",
  "Stitching",
  "Ready for Delivery",
  "Delivered",
];

export type OcrVerificationStatus = "none" | "ai_extracted" | "verified";

export interface Measurements {
  length: string;
  chest: string;
  waist: string;
  hip: string;
  sleeve: string;
  front_neck: string;
  back_neck: string;
  border: string;
  shoulder: string;
  bottom: string;
  extra_notes: string;
}

export const EMPTY_MEASUREMENTS: Measurements = {
  length: "",
  chest: "",
  waist: "",
  hip: "",
  sleeve: "",
  front_neck: "",
  back_neck: "",
  border: "",
  shoulder: "",
  bottom: "",
  extra_notes: "",
};

export interface MeasurementFieldMeta {
  key: keyof Omit<Measurements, "extra_notes">;
  label: string;
  hindi: string;
  placeholder: string;
}

export const MEASUREMENT_FIELDS: MeasurementFieldMeta[] = [
  { key: "length", label: "Length", hindi: "लम्बाई", placeholder: 'e.g. 42"' },
  { key: "chest", label: "Chest", hindi: "सीना", placeholder: 'e.g. 36"' },
  { key: "waist", label: "Waist", hindi: "कमर", placeholder: 'e.g. 30"' },
  { key: "hip", label: "Hip", hindi: "हिप", placeholder: 'e.g. 39"' },
  { key: "sleeve", label: "Sleeve", hindi: "बाजू", placeholder: 'e.g. 16" / 4.5"' },
  { key: "front_neck", label: "Front Neck", hindi: "आगे गला", placeholder: 'e.g. 6.5" Round' },
  { key: "back_neck", label: "Back Neck", hindi: "पीछे गला", placeholder: 'e.g. 8.5" Deep' },
  { key: "border", label: "Border", hindi: "बॉर्डर", placeholder: "e.g. Zari / Piping" },
  { key: "shoulder", label: "Shoulder", hindi: "तीरा", placeholder: 'e.g. 14.5"' },
  { key: "bottom", label: "Bottom / Mohri", hindi: "मोहरी", placeholder: 'e.g. 13" Palazzo' },
];

export interface BillItem {
  description: string;
  amount: number;
}

export interface DesignPhoto {
  url: string;
  label: string;
  kind: "sketch" | "fabric" | "reference";
}

export interface OcrExtractionResult {
  serial_no: string;
  customer_name: string;
  phone: string;
  address: string;
  garment_type: string;
  order_date: string;
  delivery_date: string;
  measurements: Measurements;
  items: BillItem[];
  total_amount: number | null;
  advance_paid: number | null;
  balance_due: number | null;
  uncertain_fields: string[];
  raw_text_summary: string;
}

export interface BoutiqueOrder {
  id: number;
  customer_id: number | null;
  serial_no: string;
  customer_name: string;
  phone: string;
  address: string;
  garment_type: string;
  order_date: string;
  delivery_date: string;
  status: OrderStatus;
  measurements: Measurements;
  items: BillItem[];
  total_amount: number;
  advance_paid: number;
  balance_due: number;
  slip_photo_url: string;
  design_photos: DesignPhoto[];
  ocr_raw_json: string;
  ocr_confidence: OcrVerificationStatus;
  verified_by: string;
  created_at: string;
  updated_at: string;
}

export interface OrderInput {
  customer_id?: number | null;
  serial_no: string;
  customer_name: string;
  phone: string;
  address?: string;
  garment_type?: string;
  order_date: string;
  delivery_date: string;
  status?: OrderStatus;
  measurements?: Partial<Measurements>;
  items?: BillItem[];
  total_amount?: number;
  advance_paid?: number;
  balance_due?: number;
  slip_photo_url?: string;
  design_photos?: DesignPhoto[];
  ocr_raw_json?: string;
  ocr_confidence?: OcrVerificationStatus;
  verified_by?: string;
}

export interface CustomerSummary {
  id: number;
  key: string;
  customer_name: string;
  phone: string;
  address: string;
  notes: string;
  order_count: number;
  total_spent: number;
  pending_balance: number;
  last_order_date: string;
  latest_measurements: Measurements;
  latest_serial_no: string;
  orders: BoutiqueOrder[];
}

export function normalizePhoneKey(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, "");
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

export interface ShopSettings {
  shop_name: string;
  shop_phone: string;
  shop_address: string;
  default_unit: string;
}

export function formatINR(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(safe);
}

export function normalizeIndianPhone(rawPhone: string): string {
  const digits = rawPhone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  if (digits.startsWith("0") && digits.length === 11) return `91${digits.slice(1)}`;
  return digits;
}

export function buildWhatsAppMessage(
  order: BoutiqueOrder,
  shopName: string,
  kind: "receipt" | "ready" | "reminder"
): string {
  const brand = shopName || "Our Boutique";
  if (kind === "ready") {
    return [
      `Namaste ${order.customer_name} ji!`,
      `Your tailoring order *#${order.serial_no}* (${order.garment_type || "Garment"}) at *${brand}* is *Ready for Delivery*!`,
      order.balance_due > 0
        ? `Balance Due: ${formatINR(order.balance_due)} (Total ${formatINR(order.total_amount)}, Advance ${formatINR(order.advance_paid)}).`
        : `Payment Status: Paid in full (${formatINR(order.total_amount)}).`,
      `Please visit at your convenience to collect your outfit.`,
    ].join("\n\n");
  }

  if (kind === "reminder") {
    return [
      `Namaste ${order.customer_name} ji!`,
      `Gentle update from *${brand}* regarding order *#${order.serial_no}* (${order.garment_type || "Garment"}).`,
      `Current Stage: *${order.status}* | Delivery Date: *${order.delivery_date}*`,
      order.balance_due > 0 ? `Balance Due on pickup: ${formatINR(order.balance_due)}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  const itemsText =
    order.items.length > 0
      ? order.items
          .map((item) => `• ${item.description}: ${formatINR(item.amount)}`)
          .join("\n")
      : `• Tailoring Charges: ${formatINR(order.total_amount)}`;

  return [
    `*${brand} — Digital Tailoring Slip*`,
    `Slip No: *#${order.serial_no}* | Date: ${order.order_date}`,
    `Customer: *${order.customer_name}*`,
    `Garment: ${order.garment_type || "Custom Tailoring"}`,
    `Delivery Date: *${order.delivery_date}*`,
    ``,
    `*Charges:*`,
    itemsText,
    `Total: *${formatINR(order.total_amount)}*`,
    `Advance Paid: ${formatINR(order.advance_paid)}`,
    `Balance Due: *${formatINR(order.balance_due)}*`,
    ``,
    `Thank you for choosing ${brand}!`,
  ].join("\n");
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const normalized = normalizeIndianPhone(phone);
  const encoded = encodeURIComponent(message);
  return normalized
    ? `https://wa.me/${normalized}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}

export function getDeliveryUrgency(
  deliveryDate: string,
  status: OrderStatus,
  todayStr: string
): "overdue" | "today" | "upcoming" | "normal" | "done" {
  if (status === "Delivered") return "done";
  if (!deliveryDate) return "normal";
  if (deliveryDate < todayStr) return "overdue";
  if (deliveryDate === todayStr) return "today";

  const d1 = new Date(`${todayStr}T00:00:00`);
  const d2 = new Date(`${deliveryDate}T00:00:00`);
  const diffDays = Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays >= 0 && diffDays <= 2) return "upcoming";
  return "normal";
}
