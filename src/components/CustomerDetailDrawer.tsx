"use client";
/* eslint-disable @next/next/no-img-element */

import React, { useState } from "react";
import {
  Camera,
  CheckCircle2,
  Copy,
  Edit3,
  MapPin,
  Phone,
  Plus,
  Save,
  Scissors,
  X,
} from "lucide-react";
import {
  BoutiqueOrder,
  CustomerSummary,
  Measurements,
  formatINR,
} from "@/lib/types";

interface CustomerDetailDrawerProps {
  customer: CustomerSummary | null;
  onClose: () => void;
  onAppendNewOrder: (
    customer: CustomerSummary,
    copyMeasurements?: Partial<Measurements>
  ) => void;
  onOpenOrder: (order: BoutiqueOrder) => void;
  onCustomerUpdated: () => Promise<void>;
}

export default function CustomerDetailDrawer({
  customer,
  onClose,
  onAppendNewOrder,
  onOpenOrder,
  onCustomerUpdated,
}: CustomerDetailDrawerProps) {
  const [editingProfile, setEditingProfile] = useState(false);
  const [name, setName] = useState(customer?.customer_name ?? "");
  const [phone, setPhone] = useState(customer?.phone ?? "");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [notes, setNotes] = useState(customer?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!customer) return null;

  const startEdit = () => {
    setName(customer.customer_name);
    setPhone(customer.phone);
    setAddress(customer.address);
    setNotes(customer.notes);
    setError("");
    setEditingProfile(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) {
      setError("Customer Name and Phone are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer_name: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          notes: notes.trim(),
        }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error || "Failed to update customer");
      }
      setEditingProfile(false);
      await onCustomerUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save customer");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50 backdrop-blur-xs">
      <div className="flex h-full w-full max-w-2xl flex-col bg-[#faf7f2] shadow-2xl">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6ddd0] bg-white px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-[#1f1a1c]">
                {customer.customer_name}
              </h2>
              <span className="rounded-full bg-[#f5e9ec] px-2.5 py-0.5 text-xs font-semibold text-[#5b1e31]">
                {customer.order_count}{" "}
                {customer.order_count === 1 ? "order" : "orders"}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[#6d6265]">
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" /> {customer.phone}
              </span>
              {customer.address && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {customer.address}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onAppendNewOrder(customer)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#5b1e31] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#471625]"
            >
              <Plus className="h-4 w-4" /> Append New Order
            </button>
            {!editingProfile && (
              <button
                type="button"
                onClick={startEdit}
                className="rounded-xl border border-[#e6ddd0] bg-white p-2 text-[#4a4043] hover:border-[#5b1e31]"
                title="Edit Customer Details"
              >
                <Edit3 className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl p-2 text-[#6d6265] hover:bg-[#faf7f2]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Edit Customer Form */}
          {editingProfile && (
            <form
              onSubmit={handleSaveProfile}
              className="rounded-2xl border border-[#5b1e31]/30 bg-white p-4 space-y-3"
            >
              <h3 className="text-sm font-bold text-[#1f1a1c]">
                Edit Customer Profile
              </h3>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#4a4043]">
                    Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-xl border border-[#e6ddd0] px-3 py-1.5 text-sm outline-none focus:border-[#5b1e31]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#4a4043]">
                    Phone *
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-xl border border-[#e6ddd0] px-3 py-1.5 text-sm outline-none focus:border-[#5b1e31]"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#4a4043]">
                  Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full rounded-xl border border-[#e6ddd0] px-3 py-1.5 text-sm outline-none focus:border-[#5b1e31]"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#4a4043]">
                  Customer Preferences / Notes
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Prefers loose sleeves, cotton lining only..."
                  className="w-full rounded-xl border border-[#e6ddd0] px-3 py-1.5 text-sm outline-none focus:border-[#5b1e31]"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingProfile(false)}
                  className="rounded-xl border border-[#e6ddd0] px-3 py-1.5 text-xs font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1 rounded-xl bg-[#5b1e31] px-3.5 py-1.5 text-xs font-semibold text-white"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saving ? "Saving..." : "Save Profile"}
                </button>
              </div>
            </form>
          )}

          {/* Customer Summary Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-[#e6ddd0] bg-white p-3">
              <p className="text-[11px] text-[#6d6265]">Total Orders</p>
              <p className="mt-1 text-lg font-bold text-[#1f1a1c]">
                {customer.order_count}
              </p>
            </div>
            <div className="rounded-2xl border border-[#e6ddd0] bg-white p-3">
              <p className="text-[11px] text-[#6d6265]">Total Spent</p>
              <p className="mt-1 text-lg font-bold text-[#1f1a1c]">
                {formatINR(customer.total_spent)}
              </p>
            </div>
            <div className="rounded-2xl border border-[#e6ddd0] bg-white p-3">
              <p className="text-[11px] text-[#6d6265]">Pending Balance</p>
              <p
                className={`mt-1 text-lg font-bold ${
                  customer.pending_balance > 0
                    ? "text-[#5b1e31]"
                    : "text-emerald-700"
                }`}
              >
                {formatINR(customer.pending_balance)}
              </p>
            </div>
          </div>

          {customer.notes && !editingProfile && (
            <div className="rounded-2xl border border-[#e6ddd0] bg-[#fffcf5] p-3 text-xs text-[#4a4043]">
              <strong className="text-[#1f1a1c]">Customer Notes:</strong>{" "}
              {customer.notes}
            </div>
          )}

          {/* Order History Timeline */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#1f1a1c]">
                Order &amp; Cloth History ({customer.orders.length})
              </h3>
              <span className="text-[11px] text-[#6d6265]">
                Newest orders first
              </span>
            </div>

            {customer.orders.map((order) => (
              <div
                key={order.id}
                className="rounded-2xl border border-[#e6ddd0] bg-white p-4 shadow-xs"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-[#5b1e31] px-2 py-0.5 text-xs font-bold text-white">
                        #{order.serial_no}
                      </span>
                      <span className="inline-flex items-center gap-1 text-sm font-bold text-[#1f1a1c]">
                        <Scissors className="h-3.5 w-3.5 text-[#5b1e31]" />
                        {order.garment_type || "Custom Tailoring"}
                      </span>
                      {order.ocr_confidence === "verified" && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" /> Verified
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-[#6d6265]">
                      Ordered: {order.order_date} • Delivery:{" "}
                      <strong className="text-[#1f1a1c]">
                        {order.delivery_date}
                      </strong>{" "}
                      • Stage: <strong>{order.status}</strong>
                    </p>
                  </div>

                  <div className="text-right text-xs">
                    <div className="font-bold text-[#1f1a1c]">
                      {formatINR(order.total_amount)}
                    </div>
                    <div
                      className={
                        order.balance_due > 0
                          ? "font-semibold text-[#5b1e31]"
                          : "text-emerald-700"
                      }
                    >
                      {order.balance_due > 0
                        ? `Due ${formatINR(order.balance_due)}`
                        : "Paid"}
                    </div>
                  </div>
                </div>

                {/* Measurements & Slip Thumb */}
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
                  {order.slip_photo_url && (
                    <img
                      src={order.slip_photo_url}
                      alt={`Slip #${order.serial_no}`}
                      className="h-20 w-20 shrink-0 rounded-xl border border-[#e6ddd0] bg-[#1a1617] object-cover"
                    />
                  )}
                  <div className="flex-1 space-y-1.5">
                    <div className="flex flex-wrap gap-1.5 text-[11px] text-[#4a4043]">
                      {order.measurements.length && (
                        <span className="rounded bg-[#faf7f2] px-2 py-0.5">
                          L: <strong>{order.measurements.length}</strong>
                        </span>
                      )}
                      {order.measurements.chest && (
                        <span className="rounded bg-[#faf7f2] px-2 py-0.5">
                          C: <strong>{order.measurements.chest}</strong>
                        </span>
                      )}
                      {order.measurements.waist && (
                        <span className="rounded bg-[#faf7f2] px-2 py-0.5">
                          W: <strong>{order.measurements.waist}</strong>
                        </span>
                      )}
                      {order.measurements.hip && (
                        <span className="rounded bg-[#faf7f2] px-2 py-0.5">
                          H: <strong>{order.measurements.hip}</strong>
                        </span>
                      )}
                      {order.measurements.sleeve && (
                        <span className="rounded bg-[#faf7f2] px-2 py-0.5">
                          बाजू: <strong>{order.measurements.sleeve}</strong>
                        </span>
                      )}
                      {order.measurements.front_neck && (
                        <span className="rounded bg-[#faf7f2] px-2 py-0.5">
                          F.Neck: <strong>{order.measurements.front_neck}</strong>
                        </span>
                      )}
                      {order.measurements.back_neck && (
                        <span className="rounded bg-[#faf7f2] px-2 py-0.5">
                          B.Neck: <strong>{order.measurements.back_neck}</strong>
                        </span>
                      )}
                      {order.measurements.border && (
                        <span className="rounded bg-[#faf7f2] px-2 py-0.5">
                          बॉर्डर: <strong>{order.measurements.border}</strong>
                        </span>
                      )}
                    </div>
                    {order.measurements.extra_notes && (
                      <p className="text-[11px] text-[#6d6265]">
                        {order.measurements.extra_notes}
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-[#f1ebe2] pt-2.5">
                  {order.slip_photo_url && (
                    <span className="mr-auto inline-flex items-center gap-1 text-[11px] text-[#6d6265]">
                      <Camera className="h-3 w-3" /> Slip attached
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      onAppendNewOrder(customer, order.measurements)
                    }
                    className="inline-flex items-center gap-1 rounded-xl border border-[#e6ddd0] bg-[#faf7f2] px-3 py-1.5 text-[11px] font-semibold text-[#4a4043] hover:border-[#5b1e31] hover:text-[#5b1e31]"
                  >
                    <Copy className="h-3 w-3" /> Append New Order + Copy Measurements
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenOrder(order)}
                    className="rounded-xl bg-[#5b1e31] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#471625]"
                  >
                    Open Order
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
