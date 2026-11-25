"use client";
/* eslint-disable @next/next/no-img-element */

import React, { useRef, useState } from "react";
import {
  AlertCircle,
  Brush,
  ImagePlus,
  Plus,
  Ruler,
  Save,
  Trash2,
  UserCheck,
  X,
} from "lucide-react";
import {
  BillItem,
  BoutiqueOrder,
  CustomerSummary,
  DesignPhoto,
  EMPTY_MEASUREMENTS,
  MEASUREMENT_FIELDS,
  Measurements,
  ORDER_STAGES,
  OcrExtractionResult,
  OcrVerificationStatus,
  OrderInput,
  OrderStatus,
  formatINR,
  normalizePhoneKey,
} from "@/lib/types";
import SlipCaptureViewer from "./SlipCaptureViewer";
import NecklineSketchModal from "./NecklineSketchModal";

interface OrderFormModalProps {
  open: boolean;
  editingOrder: BoutiqueOrder | null;
  prefillMeasurements?: Partial<Measurements>;
  prefillCustomer?: { id?: number; name: string; phone: string; address: string };
  defaultSerialNo: string;
  customers: CustomerSummary[];
  hasEnvGeminiKey: boolean;
  sessionGeminiKey: string;
  onClose: () => void;
  onSaved: (order: BoutiqueOrder) => void;
  onOpenSettings: () => void;
}

const GARMENT_PRESETS = [
  "Suit / Salwar",
  "Blouse",
  "Anarkali",
  "Kurti & Pant",
  "Lehenga",
  "Gown",
  "Alteration",
];

const QUICK_BILL_PRESETS: BillItem[] = [
  { description: "Suit Stitching", amount: 1200 },
  { description: "Blouse Stitching", amount: 900 },
  { description: "Cotton Lining (अस्तर)", amount: 300 },
  { description: "Piping / Lace / Border", amount: 200 },
];

function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function OrderFormModal({
  open,
  editingOrder,
  prefillMeasurements,
  prefillCustomer,
  defaultSerialNo,
  customers,
  hasEnvGeminiKey,
  sessionGeminiKey,
  onClose,
  onSaved,
  onOpenSettings,
}: OrderFormModalProps) {
  const designInputRef = useRef<HTMLInputElement | null>(null);

  const parsedStoredOcr = (() => {
    if (!editingOrder?.ocr_raw_json) return null;
    try {
      return JSON.parse(
        editingOrder.ocr_raw_json
      ) as Partial<OcrExtractionResult>;
    } catch {
      return null;
    }
  })();

  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(
    editingOrder?.customer_id ?? prefillCustomer?.id ?? null
  );
  const [serialNo, setSerialNo] = useState(
    editingOrder ? editingOrder.serial_no : defaultSerialNo
  );
  const [customerName, setCustomerName] = useState(
    editingOrder
      ? editingOrder.customer_name
      : prefillCustomer?.name ?? ""
  );
  const [phone, setPhone] = useState(
    editingOrder ? editingOrder.phone : prefillCustomer?.phone ?? ""
  );
  const [address, setAddress] = useState(
    editingOrder ? editingOrder.address : prefillCustomer?.address ?? ""
  );
  const [garmentType, setGarmentType] = useState(
    editingOrder ? editingOrder.garment_type || "Suit / Salwar" : "Suit / Salwar"
  );
  const [orderDate, setOrderDate] = useState(
    editingOrder ? editingOrder.order_date : getTodayIso()
  );
  const [deliveryDate, setDeliveryDate] = useState(
    editingOrder ? editingOrder.delivery_date : addDaysIso(5)
  );
  const [status, setStatus] = useState<OrderStatus>(
    editingOrder ? editingOrder.status : "Received"
  );
  const [measurements, setMeasurements] = useState<Measurements>(
    editingOrder
      ? { ...EMPTY_MEASUREMENTS, ...editingOrder.measurements }
      : { ...EMPTY_MEASUREMENTS, ...(prefillMeasurements ?? {}) }
  );
  const [items, setItems] = useState<BillItem[]>(
    editingOrder
      ? editingOrder.items.length > 0
        ? editingOrder.items
        : [{ description: "Tailoring Charges", amount: editingOrder.total_amount }]
      : [{ description: "Suit Stitching", amount: 1200 }]
  );
  const [manualTotalOverride, setManualTotalOverride] = useState<string>(() => {
    if (!editingOrder) return "";
    const sum = editingOrder.items.reduce((a, b) => a + (b.amount || 0), 0);
    return editingOrder.total_amount !== sum && editingOrder.items.length === 0
      ? String(editingOrder.total_amount)
      : "";
  });
  const [advancePaid, setAdvancePaid] = useState<string>(
    editingOrder ? String(editingOrder.advance_paid ?? 0) : "0"
  );

  const [slipPhotoUrl, setSlipPhotoUrl] = useState(
    editingOrder ? editingOrder.slip_photo_url : ""
  );
  const [designPhotos, setDesignPhotos] = useState<DesignPhoto[]>(
    editingOrder ? editingOrder.design_photos : []
  );
  const [ocrRawJson, setOcrRawJson] = useState(
    editingOrder ? editingOrder.ocr_raw_json : ""
  );
  const [ocrConfidence, setOcrConfidence] = useState<OcrVerificationStatus>(
    editingOrder ? editingOrder.ocr_confidence : "none"
  );
  const [verifiedBy, setVerifiedBy] = useState(
    editingOrder ? editingOrder.verified_by : ""
  );
  const [uncertainFields, setUncertainFields] = useState<string[]>(
    parsedStoredOcr?.uncertain_fields ?? []
  );
  const [aiFilledFields, setAiFilledFields] = useState<Set<string>>(new Set());
  const [rawSummary, setRawSummary] = useState(
    parsedStoredOcr?.raw_text_summary ?? ""
  );

  const [sketchOpen, setSketchOpen] = useState(false);
  const [uploadingDesign, setUploadingDesign] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const itemsTotal = items.reduce(
    (sum, item) => sum + (Number(item.amount) || 0),
    0
  );
  const totalAmount =
    manualTotalOverride.trim() !== ""
      ? Number(manualTotalOverride) || 0
      : itemsTotal;
  const advanceNum = Number(advancePaid) || 0;
  const balanceDue = Math.max(0, totalAmount - advanceNum);

  const selectedCustomer =
    customers.find((c) => c.id === selectedCustomerId) ?? null;

  const phoneKey = normalizePhoneKey(phone);
  const matchingCustomer =
    !selectedCustomer && !editingOrder
      ? phoneKey
        ? customers.find((c) => normalizePhoneKey(c.phone) === phoneKey)
        : customerName.trim().length >= 3
          ? customers.find(
              (c) =>
                c.customer_name.toLowerCase() === customerName.trim().toLowerCase()
            )
          : undefined
      : undefined;

  const handleLinkCustomer = (
    c: CustomerSummary,
    copyMeasurements = false
  ) => {
    setSelectedCustomerId(c.id);
    setCustomerName(c.customer_name);
    setPhone(c.phone);
    if (c.address) setAddress(c.address);
    if (copyMeasurements) {
      setMeasurements({ ...EMPTY_MEASUREMENTS, ...c.latest_measurements });
    }
  };

  const handleExtractionComplete = (result: OcrExtractionResult) => {
    const filled = new Set<string>();
    if (result.serial_no) {
      setSerialNo(result.serial_no);
      filled.add("serial_no");
    }
    if (result.customer_name) {
      setCustomerName(result.customer_name);
      filled.add("customer_name");
    }
    if (result.phone) {
      setPhone(result.phone);
      filled.add("phone");
    }
    if (result.address) {
      setAddress(result.address);
      filled.add("address");
    }
    if (result.garment_type) {
      setGarmentType(result.garment_type);
      filled.add("garment_type");
    }
    if (result.order_date) {
      setOrderDate(result.order_date);
      filled.add("order_date");
    }
    if (result.delivery_date) {
      setDeliveryDate(result.delivery_date);
      filled.add("delivery_date");
    }

    const nextM = { ...measurements };
    (Object.keys(EMPTY_MEASUREMENTS) as (keyof Measurements)[]).forEach(
      (key) => {
        const val = result.measurements?.[key];
        if (val && val.trim()) {
          nextM[key] = val.trim();
          filled.add(`measurements.${key}`);
        }
      }
    );
    setMeasurements(nextM);

    if (result.items && result.items.length > 0) {
      setItems(result.items);
      setManualTotalOverride("");
      filled.add("items");
    } else if (
      typeof result.total_amount === "number" &&
      result.total_amount > 0
    ) {
      setItems([
        { description: result.garment_type || "Tailoring Charges", amount: result.total_amount },
      ]);
      setManualTotalOverride("");
      filled.add("total_amount");
    }

    if (typeof result.advance_paid === "number") {
      setAdvancePaid(String(result.advance_paid));
      filled.add("advance_paid");
    }

    setAiFilledFields(filled);
    setUncertainFields(result.uncertain_fields ?? []);
    setRawSummary(result.raw_text_summary ?? "");
    setOcrRawJson(JSON.stringify(result));
    setOcrConfidence("ai_extracted");
  };

  const handleUploadDesignPhoto = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingDesign(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("prefix", "fabric");
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        throw new Error(json.error || "Failed to upload fabric/design photo");
      }
      setDesignPhotos((prev) => [
        ...prev,
        {
          url: json.url!,
          label: file.name.replace(/\.[^.]+$/, "").slice(0, 28) || "Fabric Photo",
          kind: "fabric",
        },
      ]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to upload design photo"
      );
    } finally {
      setUploadingDesign(false);
    }
  };

  const updateMeasurement = (key: keyof Measurements, value: string) => {
    setMeasurements((prev) => ({ ...prev, [key]: value }));
  };

  const isUncertain = (fieldKey: string) =>
    uncertainFields.some(
      (f) => f === fieldKey || f.endsWith(`.${fieldKey}`)
    );

  const isAiFilled = (fieldKey: string) =>
    aiFilledFields.has(fieldKey) || aiFilledFields.has(`measurements.${fieldKey}`);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serialNo.trim() || !customerName.trim() || !phone.trim()) {
      setError("Serial No., Customer Name, and Phone Number are required.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const payload: OrderInput = {
        customer_id: selectedCustomerId,
        serial_no: serialNo.trim(),
        customer_name: customerName.trim(),
        phone: phone.trim(),
        address: address.trim(),
        garment_type: garmentType.trim(),
        order_date: orderDate,
        delivery_date: deliveryDate,
        status,
        measurements,
        items: items.filter((it) => it.description.trim() || it.amount > 0),
        total_amount: totalAmount,
        advance_paid: advanceNum,
        balance_due: balanceDue,
        slip_photo_url: slipPhotoUrl,
        design_photos: designPhotos,
        ocr_raw_json: ocrRawJson,
        ocr_confidence: ocrConfidence,
        verified_by: verifiedBy.trim(),
      };

      const url = editingOrder
        ? `/api/orders/${editingOrder.id}`
        : "/api/orders";
      const method = editingOrder ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as {
        order?: BoutiqueOrder;
        error?: string;
      };
      if (!res.ok || !json.order) {
        throw new Error(json.error || "Failed to save order");
      }
      onSaved(json.order);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save order");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 p-2 sm:p-4 backdrop-blur-xs">
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[#e6ddd0] bg-[#faf7f2] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#e6ddd0] bg-white px-5 py-3.5">
          <div>
            <h2 className="text-lg font-bold text-[#1f1a1c]">
              {editingOrder
                ? `Edit Order #${editingOrder.serial_no} — ${editingOrder.customer_name}`
                : "New Tailoring Order & Slip Capture"}
            </h2>
            <p className="text-xs text-[#6d6265]">
              Dual-entry safety: keep the handwritten slip visible on the left while verifying measurements &amp; billing on the right.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#6d6265] hover:bg-[#faf7f2]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            {error && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              {/* LEFT PANE: Slip Photo + AI OCR + Design Sketches */}
              <div className="space-y-4 lg:col-span-5 lg:sticky lg:top-0 lg:self-start">
                <SlipCaptureViewer
                  slipPhotoUrl={slipPhotoUrl}
                  ocrConfidence={ocrConfidence}
                  verifiedBy={verifiedBy}
                  uncertainFields={uncertainFields}
                  rawSummary={rawSummary}
                  hasEnvGeminiKey={hasEnvGeminiKey}
                  sessionGeminiKey={sessionGeminiKey}
                  onChangeSlipUrl={setSlipPhotoUrl}
                  onExtractionComplete={handleExtractionComplete}
                  onChangeVerification={(nextStatus, nextVerifier) => {
                    setOcrConfidence(nextStatus);
                    setVerifiedBy(nextVerifier);
                  }}
                  onOpenSettings={onOpenSettings}
                />

                {/* Neckline Sketch & Fabric Photo Box */}
                <div className="rounded-2xl border border-[#e6ddd0] bg-white p-4 shadow-xs">
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-[#1f1a1c]">
                        Neckline Sketches &amp; Fabric Photos
                      </h3>
                      <p className="text-[11px] text-[#6d6265]">
                        Attach fabric swatches, lace references, or draw a neck pattern.
                      </p>
                    </div>
                  </div>

                  <input
                    ref={designInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleUploadDesignPhoto}
                    className="hidden"
                  />

                  <div className="mb-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSketchOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#5b1e31]/30 bg-[#f5e9ec] px-3 py-1.5 text-xs font-semibold text-[#5b1e31] hover:bg-[#ebd7dd]"
                    >
                      <Brush className="h-3.5 w-3.5" />
                      Draw Neckline Sketch
                    </button>
                    <button
                      type="button"
                      disabled={uploadingDesign}
                      onClick={() => designInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-[#e6ddd0] bg-[#faf7f2] px-3 py-1.5 text-xs font-medium text-[#1f1a1c] hover:border-[#5b1e31] disabled:opacity-60"
                    >
                      <ImagePlus className="h-3.5 w-3.5 text-[#5b1e31]" />
                      {uploadingDesign ? "Uploading..." : "Add Fabric / Ref Photo"}
                    </button>
                  </div>

                  {designPhotos.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2.5">
                      {designPhotos.map((photo, idx) => (
                        <div
                          key={`${photo.url}-${idx}`}
                          className="group relative overflow-hidden rounded-xl border border-[#e6ddd0] bg-[#faf7f2]"
                        >
                          <img
                            src={photo.url}
                            alt={photo.label}
                            className="h-24 w-full object-cover"
                          />
                          <div className="flex items-center justify-between px-2 py-1">
                            <span className="truncate text-[11px] font-medium text-[#4a4043]">
                              {photo.label}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setDesignPhotos((prev) =>
                                  prev.filter((_, i) => i !== idx)
                                )
                              }
                              className="text-red-600 hover:text-red-800"
                              title="Remove attachment"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed border-[#e6ddd0] bg-[#faf7f2] py-3 text-center text-[11px] text-[#6d6265]">
                      No fabric or neckline sketch attached.
                    </p>
                  )}
                </div>
              </div>

              {/* RIGHT PANE: Customer, Measurements, Billing */}
              <div className="space-y-4 lg:col-span-7">
                {/* Customer & Order Details */}
                <div className="rounded-2xl border border-[#e6ddd0] bg-white p-4 shadow-xs">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#1f1a1c]">
                      2. Customer &amp; Order Details
                    </h3>
                    {!editingOrder && customers.length > 0 && (
                      <select
                        value={selectedCustomerId ?? ""}
                        onChange={(e) => {
                          const id = Number(e.target.value);
                          const found = customers.find((c) => c.id === id);
                          if (found) {
                            handleLinkCustomer(found, false);
                          } else {
                            setSelectedCustomerId(null);
                          }
                        }}
                        className="rounded-xl border border-[#e6ddd0] bg-[#faf7f2] px-2.5 py-1 text-xs font-medium text-[#1f1a1c] outline-none focus:border-[#5b1e31]"
                      >
                        <option value="">Select returning customer...</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.customer_name} ({c.phone}) — {c.order_count}{" "}
                            {c.order_count === 1 ? "order" : "orders"}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {selectedCustomer && !editingOrder && (
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-900">
                      <div className="flex items-center gap-1.5">
                        <UserCheck className="h-4 w-4 shrink-0 text-emerald-700" />
                        <span>
                          Appending new order to{" "}
                          <strong>{selectedCustomer.customer_name}</strong>{" "}
                          ({selectedCustomer.order_count} existing{" "}
                          {selectedCustomer.order_count === 1
                            ? "order"
                            : "orders"}
                          ) — enter new cloth &amp; measurement details below.
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedCustomerId(null)}
                        className="font-semibold text-emerald-800 underline"
                      >
                        Detach
                      </button>
                    </div>
                  )}

                  {matchingCustomer && !editingOrder && (
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                      <span>
                        {phoneKey
                          ? "This phone number belongs to an existing customer:"
                          : "A customer with this name was found:"}{" "}
                        <strong>{matchingCustomer.customer_name}</strong> (
                        {matchingCustomer.phone} •{" "}
                        {matchingCustomer.order_count}{" "}
                        {matchingCustomer.order_count === 1
                          ? "order"
                          : "orders"}
                        ). Link this new order to keep it in their history; its
                        garment, measurements, and billing remain separate.
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleLinkCustomer(matchingCustomer, false)
                          }
                          className="rounded-lg bg-[#5b1e31] px-2.5 py-1 text-[11px] font-semibold text-white"
                        >
                          Link &amp; Append Order
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleLinkCustomer(matchingCustomer, true)
                          }
                          className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900"
                        >
                          Link + Copy Measurements
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 flex items-center justify-between text-xs font-medium text-[#4a4043]">
                        <span>Serial No. *</span>
                        {isUncertain("serial_no") && (
                          <span className="text-[10px] font-semibold text-amber-700">
                            Check
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        required
                        value={serialNo}
                        onChange={(e) => setSerialNo(e.target.value)}
                        placeholder="e.g. 679"
                        className={`w-full rounded-xl border px-3 py-2 text-sm font-semibold outline-none focus:border-[#5b1e31] ${
                          isUncertain("serial_no")
                            ? "border-amber-400 bg-amber-50/40"
                            : "border-[#e6ddd0]"
                        }`}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[#4a4043]">
                        Order Date *
                      </label>
                      <input
                        type="date"
                        required
                        value={orderDate}
                        onChange={(e) => setOrderDate(e.target.value)}
                        className="w-full rounded-xl border border-[#e6ddd0] px-3 py-2 text-sm outline-none focus:border-[#5b1e31]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 flex items-center justify-between text-xs font-medium text-[#4a4043]">
                        <span>Delivery Date *</span>
                        {isUncertain("delivery_date") && (
                          <span className="text-[10px] font-semibold text-amber-700">
                            Check
                          </span>
                        )}
                      </label>
                      <input
                        type="date"
                        required
                        value={deliveryDate}
                        onChange={(e) => setDeliveryDate(e.target.value)}
                        className={`w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-[#5b1e31] ${
                          isUncertain("delivery_date")
                            ? "border-amber-400 bg-amber-50/40"
                            : "border-[#e6ddd0]"
                        }`}
                      />
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 flex items-center justify-between text-xs font-medium text-[#4a4043]">
                        <span>Customer Name *</span>
                        {isAiFilled("customer_name") && (
                          <span className="rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">
                            AI
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        required
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="e.g. Neha Gupta"
                        className="w-full rounded-xl border border-[#e6ddd0] px-3 py-2 text-sm outline-none focus:border-[#5b1e31]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 flex items-center justify-between text-xs font-medium text-[#4a4043]">
                        <span>Phone / WhatsApp Number *</span>
                        {isUncertain("phone") && (
                          <span className="text-[10px] font-semibold text-amber-700">
                            Check digits
                          </span>
                        )}
                      </label>
                      <input
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="10-digit mobile number"
                        className={`w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-[#5b1e31] ${
                          isUncertain("phone")
                            ? "border-amber-400 bg-amber-50/40"
                            : "border-[#e6ddd0]"
                        }`}
                      />
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[#4a4043]">
                        Address
                      </label>
                      <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Locality / House No."
                        className="w-full rounded-xl border border-[#e6ddd0] px-3 py-2 text-sm outline-none focus:border-[#5b1e31]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[#4a4043]">
                        Garment Type
                      </label>
                      <input
                        type="text"
                        value={garmentType}
                        onChange={(e) => setGarmentType(e.target.value)}
                        placeholder="e.g. Anarkali Suit, Padded Blouse"
                        className="w-full rounded-xl border border-[#e6ddd0] px-3 py-2 text-sm outline-none focus:border-[#5b1e31]"
                      />
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {GARMENT_PRESETS.map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setGarmentType(preset)}
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition ${
                              garmentType === preset
                                ? "bg-[#5b1e31] text-white"
                                : "bg-[#faf7f2] text-[#6d6265] hover:bg-[#efe7da]"
                            }`}
                          >
                            {preset}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className="mb-1.5 block text-xs font-medium text-[#4a4043]">
                      Order Stage
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {ORDER_STAGES.map((stage) => (
                        <button
                          key={stage}
                          type="button"
                          onClick={() => setStatus(stage)}
                          className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                            status === stage
                              ? "bg-[#5b1e31] text-white shadow-xs"
                              : "border border-[#e6ddd0] bg-[#faf7f2] text-[#4a4043] hover:border-[#5b1e31]"
                          }`}
                        >
                          {stage}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Measurements & Design Notes */}
                <div className="rounded-2xl border border-[#e6ddd0] bg-white p-4 shadow-xs">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Ruler className="h-4 w-4 text-[#5b1e31]" />
                      <h3 className="text-sm font-semibold text-[#1f1a1c]">
                        3. Tailoring Measurements &amp; Design Notes (नाप)
                      </h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {selectedCustomer && selectedCustomer.orders.length > 0 && (
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            const ordId = Number(e.target.value);
                            const past = selectedCustomer.orders.find(
                              (o) => o.id === ordId
                            );
                            if (past) {
                              setMeasurements({
                                ...EMPTY_MEASUREMENTS,
                                ...past.measurements,
                              });
                            }
                            e.target.value = "";
                          }}
                          className="rounded-lg border border-[#e6ddd0] bg-[#faf7f2] px-2 py-1 text-[11px] font-medium text-[#4a4043] outline-none focus:border-[#5b1e31]"
                        >
                          <option value="">Copy from past order...</option>
                          {selectedCustomer.orders.map((past) => (
                            <option key={past.id} value={past.id}>
                              #{past.serial_no} — {past.garment_type || "Order"} (
                              {past.order_date})
                            </option>
                          ))}
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={() => setMeasurements({ ...EMPTY_MEASUREMENTS })}
                        className="text-[11px] font-medium text-[#6d6265] hover:text-[#5b1e31] underline"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-5">
                    {MEASUREMENT_FIELDS.map((field) => {
                      const uncertain = isUncertain(field.key);
                      const aiPopulated = isAiFilled(field.key);
                      return (
                        <div key={field.key}>
                          <label className="mb-1 flex items-center justify-between text-[11px] font-medium text-[#4a4043]">
                            <span>
                              {field.label}{" "}
                              <span className="text-[#8a7d80]">
                                ({field.hindi})
                              </span>
                            </span>
                            {uncertain ? (
                              <span className="text-[10px] font-bold text-amber-700">
                                !
                              </span>
                            ) : aiPopulated ? (
                              <span className="text-[9px] font-semibold text-[#b47b2b]">
                                AI
                              </span>
                            ) : null}
                          </label>
                          <input
                            type="text"
                            value={measurements[field.key]}
                            onChange={(e) =>
                              updateMeasurement(field.key, e.target.value)
                            }
                            placeholder={field.placeholder}
                            className={`w-full rounded-xl border px-2.5 py-1.5 text-sm outline-none focus:border-[#5b1e31] ${
                              uncertain
                                ? "border-amber-400 bg-amber-50/50"
                                : aiPopulated
                                ? "border-[#d4a862] bg-[#fffcf5]"
                                : "border-[#e6ddd0]"
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3">
                    <label className="mb-1 flex items-center justify-between text-xs font-medium text-[#4a4043]">
                      <span>
                        Stitching &amp; Design Notes (डिज़ाइन / अस्तर / पाइपिंग नोट्स)
                      </span>
                      {isAiFilled("extra_notes") && (
                        <span className="rounded bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800">
                          AI
                        </span>
                      )}
                    </label>
                    <textarea
                      rows={2}
                      value={measurements.extra_notes}
                      onChange={(e) =>
                        updateMeasurement("extra_notes", e.target.value)
                      }
                      placeholder="Write any special neck cut, lining, dori, hook, or fitting notes in Hindi or English..."
                      className="w-full rounded-xl border border-[#e6ddd0] px-3 py-2 text-sm outline-none focus:border-[#5b1e31]"
                    />
                  </div>
                </div>

                {/* Billing & Payment */}
                <div className="rounded-2xl border border-[#e6ddd0] bg-white p-4 shadow-xs">
                  <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#1f1a1c]">
                      4. Itemized Billing &amp; Balance (₹)
                    </h3>
                    <div className="flex flex-wrap gap-1">
                      {QUICK_BILL_PRESETS.map((preset) => (
                        <button
                          key={preset.description}
                          type="button"
                          onClick={() =>
                            setItems((prev) => [...prev, { ...preset }])
                          }
                          className="rounded-lg border border-[#e6ddd0] bg-[#faf7f2] px-2 py-0.5 text-[11px] font-medium text-[#4a4043] hover:border-[#5b1e31]"
                        >
                          + {preset.description}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    {items.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((it, i) =>
                                i === idx
                                  ? { ...it, description: e.target.value }
                                  : it
                              )
                            )
                          }
                          placeholder="Item description (e.g. Suit Stitching)"
                          className="flex-1 rounded-xl border border-[#e6ddd0] px-3 py-1.5 text-sm outline-none focus:border-[#5b1e31]"
                        />
                        <div className="relative w-32">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#6d6265]">
                            ₹
                          </span>
                          <input
                            type="number"
                            min={0}
                            value={item.amount}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 0;
                              setManualTotalOverride("");
                              setItems((prev) =>
                                prev.map((it, i) =>
                                  i === idx ? { ...it, amount: val } : it
                                )
                              );
                            }}
                            className="w-full rounded-xl border border-[#e6ddd0] pl-7 pr-2.5 py-1.5 text-sm font-medium outline-none focus:border-[#5b1e31]"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setManualTotalOverride("");
                            setItems((prev) =>
                              prev.length > 1
                                ? prev.filter((_, i) => i !== idx)
                                : [{ description: "", amount: 0 }]
                            );
                          }}
                          className="rounded-lg p-1.5 text-[#6d6265] hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setItems((prev) => [
                        ...prev,
                        { description: "", amount: 0 },
                      ])
                    }
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#5b1e31] hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Line Item
                  </button>

                  <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-[#e6ddd0] bg-[#faf7f2] p-3 sm:grid-cols-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[#4a4043]">
                        Total Amount (₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={
                          manualTotalOverride !== ""
                            ? manualTotalOverride
                            : itemsTotal
                        }
                        onChange={(e) => setManualTotalOverride(e.target.value)}
                        className="w-full rounded-xl border border-[#e6ddd0] bg-white px-3 py-1.5 text-sm font-bold text-[#1f1a1c] outline-none focus:border-[#5b1e31]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-[#4a4043]">
                        Advance Paid (₹)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={advancePaid}
                        onChange={(e) => setAdvancePaid(e.target.value)}
                        className="w-full rounded-xl border border-[#e6ddd0] bg-white px-3 py-1.5 text-sm font-semibold text-emerald-700 outline-none focus:border-[#5b1e31]"
                      />
                    </div>
                    <div className="flex flex-col justify-center rounded-xl bg-white px-3 py-1.5 border border-[#e6ddd0]">
                      <span className="text-[11px] font-medium text-[#6d6265]">
                        Balance Due
                      </span>
                      <span
                        className={`text-base font-bold ${
                          balanceDue > 0 ? "text-[#5b1e31]" : "text-emerald-700"
                        }`}
                      >
                        {formatINR(balanceDue)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sticky Footer */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e6ddd0] bg-white px-5 py-3">
            <div className="flex items-center gap-2 text-xs text-[#6d6265]">
              <span>
                Slip Photo:{" "}
                <strong className="text-[#1f1a1c]">
                  {slipPhotoUrl ? "Attached ✓" : "Not attached"}
                </strong>
              </span>
              <span>•</span>
              <span>
                Verification:{" "}
                <strong
                  className={
                    ocrConfidence === "verified"
                      ? "text-emerald-700"
                      : "text-[#4a4043]"
                  }
                >
                  {ocrConfidence === "verified"
                    ? "Verified"
                    : ocrConfidence === "ai_extracted"
                    ? "AI Draft (Unverified)"
                    : "Manual Entry"}
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-[#e6ddd0] px-4 py-2 text-sm font-medium text-[#4a4043] hover:bg-[#faf7f2]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#5b1e31] px-5 py-2 text-sm font-semibold text-white shadow-xs hover:bg-[#471625] disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving
                  ? "Saving Order..."
                  : editingOrder
                  ? "Update Order"
                  : "Save Tailoring Order"}
              </button>
            </div>
          </div>
        </form>
      </div>

      {sketchOpen && (
        <NecklineSketchModal
          open={sketchOpen}
          onClose={() => setSketchOpen(false)}
          onSaveSketch={(url, label) =>
            setDesignPhotos((prev) => [
              ...prev,
              { url, label, kind: "sketch" },
            ])
          }
        />
      )}
    </div>
  );
}
