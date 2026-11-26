"use client";
/* eslint-disable @next/next/no-img-element */

import React, { useState } from "react";
import {
  Check,
  CheckCircle2,
  Copy,
  Edit3,
  MessageCircle,
  Plus,
  Printer,
  Ruler,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  BoutiqueOrder,
  MEASUREMENT_FIELDS,
  ORDER_STAGES,
  OrderStatus,
  ShopSettings,
  buildWhatsAppMessage,
  buildWhatsAppUrl,
  formatINR,
} from "@/lib/types";

interface OrderDetailDrawerProps {
  order: BoutiqueOrder | null;
  settings: ShopSettings;
  customerOrderCount?: number;
  onClose: () => void;
  onEdit: (order: BoutiqueOrder) => void;
  onChangeStatus: (orderId: number, status: OrderStatus) => Promise<void>;
  onDelete: (orderId: number) => Promise<void>;
  onPrint: (order: BoutiqueOrder) => void;
  onSendReceipt: (order: BoutiqueOrder) => void;
  onOpenCustomer?: (order: BoutiqueOrder) => void;
  onAppendForCustomer?: (order: BoutiqueOrder) => void;
}

export default function OrderDetailDrawer({
  order,
  settings,
  customerOrderCount,
  onClose,
  onEdit,
  onChangeStatus,
  onDelete,
  onPrint,
  onSendReceipt,
  onOpenCustomer,
  onAppendForCustomer,
}: OrderDetailDrawerProps) {
  const [copiedKind, setCopiedKind] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  if (!order) return null;

  const openWhatsApp = (kind: "receipt" | "ready" | "reminder") => {
    const msg = buildWhatsAppMessage(order, settings.shop_name, kind);
    const url = buildWhatsAppUrl(order.phone, msg);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const copyMessage = async (kind: "receipt" | "ready") => {
    const msg = buildWhatsAppMessage(order, settings.shop_name, kind);
    await navigator.clipboard.writeText(msg);
    setCopiedKind(kind);
    setTimeout(() => setCopiedKind(null), 2000);
  };

  const handleStatusClick = async (next: OrderStatus) => {
    setUpdatingStatus(true);
    try {
      await onChangeStatus(order.id, next);
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50 backdrop-blur-xs">
      <div className="flex h-full w-full max-w-2xl flex-col bg-[#faf7f2] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e6ddd0] bg-white px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-[#5b1e31] px-2.5 py-0.5 text-xs font-bold text-white">
                #{order.serial_no}
              </span>
              <h2 className="text-lg font-bold text-[#1f1a1c]">
                {order.customer_name}
              </h2>
              {order.ocr_confidence === "verified" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="h-3 w-3" /> Verified
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-[#6d6265]">
              {order.phone} • {order.garment_type || "Custom Tailoring"} • Delivery:{" "}
              <strong className="text-[#1f1a1c]">{order.delivery_date}</strong>
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {onOpenCustomer && (
                <button
                  type="button"
                  onClick={() => onOpenCustomer(order)}
                  className="inline-flex items-center gap-1 rounded-full border border-[#e6ddd0] bg-[#faf7f2] px-2.5 py-0.5 text-[11px] font-semibold text-[#5b1e31] hover:border-[#5b1e31]"
                >
                  <Users className="h-3 w-3" />
                  Customer History
                  {customerOrderCount && customerOrderCount > 1
                    ? ` (${customerOrderCount} orders)`
                    : ""}
                </button>
              )}
              {onAppendForCustomer && (
                <button
                  type="button"
                  onClick={() => onAppendForCustomer(order)}
                  className="inline-flex items-center gap-1 rounded-full bg-[#f5e9ec] px-2.5 py-0.5 text-[11px] font-semibold text-[#5b1e31] hover:bg-[#ebd7dd]"
                >
                  <Plus className="h-3 w-3" /> Append New Order
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onPrint(order)}
              className="rounded-xl border border-[#e6ddd0] bg-white p-2 text-[#4a4043] hover:bg-[#faf7f2]"
              title="Print Receipt"
            >
              <Printer className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onEdit(order)}
              className="inline-flex items-center gap-1 rounded-xl border border-[#e6ddd0] bg-white px-3 py-2 text-xs font-semibold text-[#1f1a1c] hover:border-[#5b1e31]"
            >
              <Edit3 className="h-3.5 w-3.5" /> Edit
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-[#6d6265] hover:bg-[#faf7f2]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Stage Pipeline */}
          <div className="rounded-2xl border border-[#e6ddd0] bg-white p-4">
            <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-[#6d6265]">
              Order Stage
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {ORDER_STAGES.map((stage) => (
                <button
                  key={stage}
                  type="button"
                  disabled={updatingStatus}
                  onClick={() => handleStatusClick(stage)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    order.status === stage
                      ? "bg-[#5b1e31] text-white shadow-xs"
                      : "border border-[#e6ddd0] bg-[#faf7f2] text-[#4a4043] hover:border-[#5b1e31]"
                  }`}
                >
                  {stage}
                </button>
              ))}
            </div>
          </div>

          {/* One-Tap WhatsApp Updates */}
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
            <div className="mb-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-emerald-700" />
                <h3 className="text-sm font-semibold text-emerald-950">
                  WhatsApp Messages
                </h3>
              </div>
              <span className="text-xs text-emerald-800">{order.phone}</span>
            </div>
            <p className="mb-2.5 text-[11px] text-emerald-900">
              Send receipts only to customers who opted in to WhatsApp messages.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => openWhatsApp("ready")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Send &ldquo;Order Ready&rdquo;
              </button>
              <button
                type="button"
                onClick={() => onSendReceipt(order)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3.5 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Send Receipt PDF
              </button>
              <button
                type="button"
                onClick={() => openWhatsApp("reminder")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
              >
                Stage Update
              </button>
              <button
                type="button"
                onClick={() => copyMessage("ready")}
                className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-white px-2.5 py-2 text-xs text-emerald-800 hover:bg-emerald-100"
              >
                {copiedKind === "ready" ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Slip Photo & Attachments */}
          {(order.slip_photo_url || order.design_photos.length > 0) && (
            <div className="rounded-2xl border border-[#e6ddd0] bg-white p-4">
              <h3 className="mb-2.5 text-sm font-semibold text-[#1f1a1c]">
                Attached Slip &amp; Design References
              </h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {order.slip_photo_url && (
                  <a
                    href={order.slip_photo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="group overflow-hidden rounded-xl border border-[#e6ddd0] bg-[#faf7f2]"
                  >
                    <img
                      src={order.slip_photo_url}
                      alt="Tailoring slip"
                      className="h-44 w-full object-contain bg-[#1a1617]"
                    />
                    <div className="flex items-center justify-between px-3 py-1.5 text-xs">
                      <span className="font-semibold">Paper Slip Photo</span>
                      <span className="text-[#5b1e31] group-hover:underline">
                        Open full →
                      </span>
                    </div>
                  </a>
                )}
                {order.design_photos.map((dp, idx) => (
                  <a
                    key={idx}
                    href={dp.url}
                    target="_blank"
                    rel="noreferrer"
                    className="overflow-hidden rounded-xl border border-[#e6ddd0] bg-[#faf7f2]"
                  >
                    <img
                      src={dp.url}
                      alt={dp.label}
                      className="h-44 w-full object-cover"
                    />
                    <div className="px-3 py-1.5 text-xs font-medium text-[#4a4043]">
                      {dp.label} ({dp.kind})
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Measurements */}
          <div className="rounded-2xl border border-[#e6ddd0] bg-white p-4">
            <div className="mb-2.5 flex items-center gap-2">
              <Ruler className="h-4 w-4 text-[#5b1e31]" />
              <h3 className="text-sm font-semibold text-[#1f1a1c]">
                Tailoring Measurements (नाप)
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {MEASUREMENT_FIELDS.map((field) => (
                <div
                  key={field.key}
                  className="rounded-xl border border-[#e6ddd0] bg-[#faf7f2] px-2.5 py-2"
                >
                  <div className="text-[10px] text-[#6d6265]">
                    {field.label} ({field.hindi})
                  </div>
                  <div className="mt-0.5 text-sm font-semibold text-[#1f1a1c]">
                    {order.measurements[field.key] || "—"}
                  </div>
                </div>
              ))}
            </div>
            {order.measurements.extra_notes && (
              <div className="mt-3 rounded-xl border border-[#e6ddd0] bg-[#fffcf5] p-3 text-xs text-[#4a4043]">
                <strong className="text-[#1f1a1c]">Design Notes:</strong>{" "}
                {order.measurements.extra_notes}
              </div>
            )}
          </div>

          {/* Billing */}
          <div className="rounded-2xl border border-[#e6ddd0] bg-white p-4">
            <h3 className="mb-2.5 text-sm font-semibold text-[#1f1a1c]">
              Billing Summary
            </h3>
            <div className="space-y-1.5 text-sm">
              {order.items.map((item, idx) => (
                <div
                  key={idx}
                  className="flex justify-between border-b border-[#f3ede4] pb-1.5"
                >
                  <span className="text-[#4a4043]">{item.description}</span>
                  <span className="font-medium">{formatINR(item.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-1 font-bold">
                <span>Total</span>
                <span>{formatINR(order.total_amount)}</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>Advance Paid</span>
                <span>{formatINR(order.advance_paid)}</span>
              </div>
              <div className="flex justify-between border-t border-[#e6ddd0] pt-2 text-base font-bold text-[#5b1e31]">
                <span>Balance Due</span>
                <span>{formatINR(order.balance_due)}</span>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="flex items-center justify-between rounded-2xl border border-red-100 bg-white px-4 py-3">
            <span className="text-xs text-[#6d6265]">
              Verified by: {order.verified_by || "Not specified"} • Order Date:{" "}
              {order.order_date}
            </span>
            <button
              type="button"
              onClick={() => onDelete(order.id)}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete Order
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
