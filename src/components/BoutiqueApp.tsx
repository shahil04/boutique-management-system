"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Columns3,
  IndianRupee,
  LayoutList,
  MessageCircle,
  Phone,
  Plus,
  Printer,
  Scissors,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Users,
} from "lucide-react";
import {
  BoutiqueOrder,
  CustomerSummary,
  Measurements,
  ORDER_STAGES,
  OrderStatus,
  ShopSettings,
  buildWhatsAppMessage,
  buildWhatsAppUrl,
  formatINR,
  getDeliveryUrgency,
} from "@/lib/types";
import OrderFormModal from "./OrderFormModal";
import OrderDetailDrawer from "./OrderDetailDrawer";
import PrintReceiptModal from "./PrintReceiptModal";
import CustomerDetailDrawer from "./CustomerDetailDrawer";

interface BoutiqueAppProps {
  initialOrders: BoutiqueOrder[];
  initialCustomers: CustomerSummary[];
  initialSettings: ShopSettings;
  initialNextSerialNo: string;
  hasEnvGeminiKey: boolean;
}

type ActiveTab = "orders" | "customers" | "settings";
type ViewMode = "list" | "board";
type DueFilter = "all" | "urgent" | "upcoming";

function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const STAGE_BADGE: Record<OrderStatus, string> = {
  Received: "bg-slate-100 text-slate-700 border-slate-200",
  Cutting: "bg-amber-50 text-amber-800 border-amber-200",
  Stitching: "bg-purple-50 text-purple-800 border-purple-200",
  "Ready for Delivery": "bg-emerald-50 text-emerald-800 border-emerald-200",
  Delivered: "bg-stone-100 text-stone-600 border-stone-200",
};

export default function BoutiqueApp({
  initialOrders,
  initialCustomers,
  initialSettings,
  initialNextSerialNo,
  hasEnvGeminiKey,
}: BoutiqueAppProps) {
  const [orders, setOrders] = useState<BoutiqueOrder[]>(initialOrders);
  const [customers, setCustomers] =
    useState<CustomerSummary[]>(initialCustomers);
  const [settings, setSettings] = useState<ShopSettings>(initialSettings);
  const [nextSerialNo, setNextSerialNo] = useState(initialNextSerialNo);

  const [activeTab, setActiveTab] = useState<ActiveTab>("orders");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [dueFilter, setDueFilter] = useState<DueFilter>("all");
  const [customerSearch, setCustomerSearch] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<BoutiqueOrder | null>(null);
  const [prefillCustomer, setPrefillCustomer] = useState<
    { id?: number; name: string; phone: string; address: string } | undefined
  >(undefined);
  const [prefillMeasurements, setPrefillMeasurements] = useState<
    Partial<Measurements> | undefined
  >(undefined);

  const [detailOrder, setDetailOrder] = useState<BoutiqueOrder | null>(null);
  const [detailCustomerId, setDetailCustomerId] = useState<number | null>(null);
  const [printOrder, setPrintOrder] = useState<BoutiqueOrder | null>(null);

  // Settings form state
  const [shopNameInput, setShopNameInput] = useState(initialSettings.shop_name);
  const [shopPhoneInput, setShopPhoneInput] = useState(
    initialSettings.shop_phone
  );
  const [shopAddressInput, setShopAddressInput] = useState(
    initialSettings.shop_address
  );
  const [sessionGeminiKey, setSessionGeminiKey] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");

  const todayIso = getTodayIso();

  const refreshData = async () => {
    const [ordersRes, customersRes] = await Promise.all([
      fetch("/api/orders"),
      fetch("/api/customers"),
    ]);
    if (ordersRes.ok) {
      const data = (await ordersRes.json()) as {
        orders: BoutiqueOrder[];
        nextSerialNo: string;
      };
      setOrders(data.orders);
      setNextSerialNo(data.nextSerialNo);
      if (detailOrder) {
        const refreshed = data.orders.find((o) => o.id === detailOrder.id) ?? null;
        setDetailOrder(refreshed);
      }
    }
    if (customersRes.ok) {
      const cData = (await customersRes.json()) as {
        customers: CustomerSummary[];
      };
      setCustomers(cData.customers);
    }
  };

  const metrics = useMemo(() => {
    let activeCount = 0;
    let urgentCount = 0;
    let readyCount = 0;
    let pendingBalance = 0;

    for (const o of orders) {
      if (o.status !== "Delivered") {
        activeCount += 1;
        pendingBalance += o.balance_due;
      }
      if (o.status === "Ready for Delivery") {
        readyCount += 1;
      }
      const urg = getDeliveryUrgency(o.delivery_date, o.status, todayIso);
      if (urg === "overdue" || urg === "today") {
        urgentCount += 1;
      }
    }
    return { activeCount, urgentCount, readyCount, pendingBalance };
  }, [orders, todayIso]);

  const urgentOrders = useMemo(
    () =>
      orders.filter((o) => {
        const u = getDeliveryUrgency(o.delivery_date, o.status, todayIso);
        return u === "overdue" || u === "today";
      }),
    [orders, todayIso]
  );

  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== "All" && o.status !== statusFilter) return false;
      if (dueFilter !== "all") {
        const u = getDeliveryUrgency(o.delivery_date, o.status, todayIso);
        if (dueFilter === "urgent" && u !== "overdue" && u !== "today") {
          return false;
        }
        if (
          dueFilter === "upcoming" &&
          u !== "overdue" &&
          u !== "today" &&
          u !== "upcoming"
        ) {
          return false;
        }
      }
      if (!q) return true;
      return (
        o.serial_no.toLowerCase().includes(q) ||
        o.customer_name.toLowerCase().includes(q) ||
        o.phone.toLowerCase().includes(q) ||
        o.garment_type.toLowerCase().includes(q)
      );
    });
  }, [orders, searchQuery, statusFilter, dueFilter, todayIso]);

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.customer_name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q)
    );
  }, [customers, customerSearch]);

  const openNewOrder = () => {
    setEditingOrder(null);
    setPrefillCustomer(undefined);
    setPrefillMeasurements(undefined);
    setFormOpen(true);
  };

  const openNewOrderForCustomer = (
    customer: CustomerSummary,
    copyMeasurements?: Partial<Measurements>
  ) => {
    setDetailCustomerId(null);
    setDetailOrder(null);
    setEditingOrder(null);
    setPrefillCustomer({
      id: customer.id,
      name: customer.customer_name,
      phone: customer.phone,
      address: customer.address,
    });
    setPrefillMeasurements(copyMeasurements);
    setFormOpen(true);
  };

  const detailCustomer = useMemo(
    () => customers.find((c) => c.id === detailCustomerId) ?? null,
    [customers, detailCustomerId]
  );

  const handleStatusChange = async (orderId: number, status: OrderStatus) => {
    const res = await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      await refreshData();
    }
  };

  const handleDeleteOrder = async (orderId: number) => {
    if (!window.confirm("Delete this tailoring order permanently?")) return;
    const res = await fetch(`/api/orders/${orderId}`, { method: "DELETE" });
    if (res.ok) {
      setDetailOrder(null);
      await refreshData();
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setSettingsMessage("");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop_name: shopNameInput,
          shop_phone: shopPhoneInput,
          shop_address: shopAddressInput,
        }),
      });
      const json = (await res.json()) as { settings?: ShopSettings };
      if (res.ok && json.settings) {
        setSettings(json.settings);
        setSettingsMessage("Shop settings saved!");
      }
    } finally {
      setSavingSettings(false);
    }
  };

  const quickWhatsApp = (
    e: React.MouseEvent,
    order: BoutiqueOrder,
    kind: "ready" | "receipt"
  ) => {
    e.stopPropagation();
    const msg = buildWhatsAppMessage(order, settings.shop_name, kind);
    window.open(buildWhatsAppUrl(order.phone, msg), "_blank", "noopener,noreferrer");
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#faf7f2]">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 border-b border-[#e6ddd0] bg-white/95 backdrop-blur-xs">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#5b1e31] text-white shadow-xs">
              <Scissors className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-[#1f1a1c] sm:text-lg">
                {settings.shop_name}
              </h1>
              <p className="text-[11px] text-[#6d6265]">
                Slip OCR • Measurements • Billing • WhatsApp Alerts
              </p>
            </div>
          </div>

          <nav className="flex items-center gap-1 rounded-xl border border-[#e6ddd0] bg-[#faf7f2] p-1">
            <button
              type="button"
              onClick={() => setActiveTab("orders")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === "orders"
                  ? "bg-white text-[#5b1e31] shadow-xs"
                  : "text-[#6d6265] hover:text-[#1f1a1c]"
              }`}
            >
              <LayoutList className="h-3.5 w-3.5" />
              Orders
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("customers")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === "customers"
                  ? "bg-white text-[#5b1e31] shadow-xs"
                  : "text-[#6d6265] hover:text-[#1f1a1c]"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              Customers ({customers.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("settings")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                activeTab === "settings"
                  ? "bg-white text-[#5b1e31] shadow-xs"
                  : "text-[#6d6265] hover:text-[#1f1a1c]"
              }`}
            >
              <SettingsIcon className="h-3.5 w-3.5" />
              Settings
            </button>
          </nav>

          <button
            type="button"
            onClick={openNewOrder}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#5b1e31] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#471625] sm:text-sm"
          >
            <Camera className="h-4 w-4" />
            New Slip / Order
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6">
        {activeTab === "orders" && (
          <div className="space-y-5">
            {/* Delivery Alert Banner */}
            {urgentOrders.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" />
                  <div className="text-xs sm:text-sm text-amber-950">
                    <strong>
                      {urgentOrders.length}{" "}
                      {urgentOrders.length === 1 ? "order is" : "orders are"} due
                      today or overdue:
                    </strong>{" "}
                    {urgentOrders
                      .slice(0, 3)
                      .map((o) => `#${o.serial_no} (${o.customer_name})`)
                      .join(", ")}
                    {urgentOrders.length > 3
                      ? ` +${urgentOrders.length - 3} more`
                      : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setDueFilter((f) => (f === "urgent" ? "all" : "urgent"))
                  }
                  className="rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                >
                  {dueFilter === "urgent" ? "Show All Dates" : "Filter Urgent"}
                </button>
              </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-2xl border border-[#e6ddd0] bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between text-xs text-[#6d6265]">
                  <span>Active Orders</span>
                  <Scissors className="h-4 w-4 text-[#5b1e31]" />
                </div>
                <p className="mt-1.5 text-2xl font-bold text-[#1f1a1c]">
                  {metrics.activeCount}
                </p>
              </div>
              <div className="rounded-2xl border border-[#e6ddd0] bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between text-xs text-[#6d6265]">
                  <span>Due Today / Overdue</span>
                  <Clock className="h-4 w-4 text-amber-600" />
                </div>
                <p className="mt-1.5 text-2xl font-bold text-amber-700">
                  {metrics.urgentCount}
                </p>
              </div>
              <div className="rounded-2xl border border-[#e6ddd0] bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between text-xs text-[#6d6265]">
                  <span>Ready for Delivery</span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="mt-1.5 text-2xl font-bold text-emerald-700">
                  {metrics.readyCount}
                </p>
              </div>
              <div className="rounded-2xl border border-[#e6ddd0] bg-white p-4 shadow-xs">
                <div className="flex items-center justify-between text-xs text-[#6d6265]">
                  <span>Pending Balance</span>
                  <IndianRupee className="h-4 w-4 text-[#b47b2b]" />
                </div>
                <p className="mt-1.5 text-2xl font-bold text-[#5b1e31]">
                  {formatINR(metrics.pendingBalance)}
                </p>
              </div>
            </div>

            {/* Search & Filters */}
            <div className="rounded-2xl border border-[#e6ddd0] bg-white p-3.5 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <div className="relative flex-1 min-w-60">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a7d80]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by Serial No. (e.g. 679), Customer Name, Phone, or Garment..."
                    className="w-full rounded-xl border border-[#e6ddd0] bg-[#faf7f2] pl-9 pr-3 py-2 text-sm outline-none focus:border-[#5b1e31] focus:bg-white"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={dueFilter}
                    onChange={(e) => setDueFilter(e.target.value as DueFilter)}
                    className="rounded-xl border border-[#e6ddd0] bg-[#faf7f2] px-3 py-2 text-xs font-medium text-[#1f1a1c] outline-none focus:border-[#5b1e31]"
                  >
                    <option value="all">All Delivery Dates</option>
                    <option value="urgent">Due Today &amp; Overdue</option>
                    <option value="upcoming">Due Next 2 Days</option>
                  </select>

                  <div className="flex rounded-xl border border-[#e6ddd0] bg-[#faf7f2] p-0.5">
                    <button
                      type="button"
                      onClick={() => setViewMode("list")}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                        viewMode === "list"
                          ? "bg-white text-[#5b1e31] shadow-xs"
                          : "text-[#6d6265]"
                      }`}
                    >
                      <LayoutList className="h-3.5 w-3.5" /> List
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("board")}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                        viewMode === "board"
                          ? "bg-white text-[#5b1e31] shadow-xs"
                          : "text-[#6d6265]"
                      }`}
                    >
                      <Columns3 className="h-3.5 w-3.5" /> Stage Board
                    </button>
                  </div>
                </div>
              </div>

              {viewMode === "list" && (
                <div className="flex flex-wrap gap-1.5">
                  {["All", ...ORDER_STAGES].map((stage) => (
                    <button
                      key={stage}
                      type="button"
                      onClick={() => setStatusFilter(stage)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                        statusFilter === stage
                          ? "bg-[#5b1e31] text-white"
                          : "border border-[#e6ddd0] bg-[#faf7f2] text-[#4a4043] hover:border-[#5b1e31]"
                      }`}
                    >
                      {stage}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Orders List OR Stage Board */}
            {filteredOrders.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#d9cebe] bg-white px-6 py-12 text-center">
                <Scissors className="mx-auto mb-2 h-8 w-8 text-[#5b1e31]/60" />
                <p className="text-sm font-semibold text-[#1f1a1c]">
                  No matching tailoring orders found
                </p>
                <p className="mt-1 text-xs text-[#6d6265]">
                  Try clearing filters or snap a new tailoring slip to create an order.
                </p>
                <button
                  type="button"
                  onClick={openNewOrder}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#5b1e31] px-4 py-2 text-xs font-semibold text-white"
                >
                  <Plus className="h-4 w-4" /> New Slip / Order
                </button>
              </div>
            ) : viewMode === "list" ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {filteredOrders.map((order) => {
                  const urgency = getDeliveryUrgency(
                    order.delivery_date,
                    order.status,
                    todayIso
                  );
                  return (
                    <div
                      key={order.id}
                      onClick={() => setDetailOrder(order)}
                      className="cursor-pointer rounded-2xl border border-[#e6ddd0] bg-white p-4 shadow-xs transition hover:border-[#5b1e31]/50 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-lg bg-[#5b1e31] px-2 py-0.5 text-xs font-bold text-white">
                              #{order.serial_no}
                            </span>
                            <h3 className="truncate text-base font-bold text-[#1f1a1c]">
                              {order.customer_name}
                            </h3>
                            {order.ocr_confidence === "verified" && (
                              <span
                                title="Double-Safety Verified"
                                className="inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200"
                              >
                                <CheckCircle2 className="h-3 w-3" /> Verified
                              </span>
                            )}
                            {order.slip_photo_url && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-[#faf7f2] px-2 py-0.5 text-[10px] font-medium text-[#6d6265] border border-[#e6ddd0]">
                                <Camera className="h-2.5 w-2.5" /> Slip
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-[#6d6265]">
                            {order.garment_type || "Custom Tailoring"} •{" "}
                            <span className="inline-flex items-center gap-0.5">
                              <Phone className="h-3 w-3" /> {order.phone}
                            </span>
                          </p>
                        </div>

                        <span
                          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
                            STAGE_BADGE[order.status]
                          }`}
                        >
                          {order.status}
                        </span>
                      </div>

                      {/* Measurement Highlights */}
                      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-[#4a4043]">
                        {order.measurements.length && (
                          <span className="rounded-md bg-[#faf7f2] px-2 py-0.5">
                            L: <strong>{order.measurements.length}</strong>
                          </span>
                        )}
                        {order.measurements.chest && (
                          <span className="rounded-md bg-[#faf7f2] px-2 py-0.5">
                            C: <strong>{order.measurements.chest}</strong>
                          </span>
                        )}
                        {order.measurements.waist && (
                          <span className="rounded-md bg-[#faf7f2] px-2 py-0.5">
                            W: <strong>{order.measurements.waist}</strong>
                          </span>
                        )}
                        {order.measurements.sleeve && (
                          <span className="rounded-md bg-[#faf7f2] px-2 py-0.5">
                            बाजू: <strong>{order.measurements.sleeve}</strong>
                          </span>
                        )}
                      </div>

                      {/* Footer: Delivery + Billing + Quick Actions */}
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[#f1ebe2] pt-3">
                        <div className="flex items-center gap-3 text-xs">
                          <span
                            className={`font-medium ${
                              urgency === "overdue"
                                ? "text-red-600 font-semibold"
                                : urgency === "today"
                                ? "text-amber-700 font-semibold"
                                : "text-[#6d6265]"
                            }`}
                          >
                            {urgency === "overdue"
                              ? `Overdue (${order.delivery_date})`
                              : urgency === "today"
                              ? "Due Today"
                              : `Delivery: ${order.delivery_date}`}
                          </span>
                          <span className="text-[#d6cbbe]">|</span>
                          <span>
                            Total:{" "}
                            <strong className="text-[#1f1a1c]">
                              {formatINR(order.total_amount)}
                            </strong>
                            {order.balance_due > 0 && (
                              <span className="ml-1.5 text-[#5b1e31] font-semibold">
                                (Due {formatINR(order.balance_due)})
                              </span>
                            )}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) =>
                              quickWhatsApp(
                                e,
                                order,
                                order.status === "Ready for Delivery"
                                  ? "ready"
                                  : "receipt"
                              )
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                            title="Send WhatsApp update"
                          >
                            <MessageCircle className="h-3 w-3" />
                            {order.status === "Ready for Delivery"
                              ? "Ready WA"
                              : "WhatsApp"}
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPrintOrder(order);
                            }}
                            className="rounded-lg border border-[#e6ddd0] bg-[#faf7f2] p-1.5 text-[#4a4043] hover:border-[#5b1e31]"
                            title="Print Slip"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Stage Kanban Board */
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-5">
                {ORDER_STAGES.map((stage) => {
                  const colOrders = filteredOrders.filter(
                    (o) => o.status === stage
                  );
                  return (
                    <div
                      key={stage}
                      className="rounded-2xl border border-[#e6ddd0] bg-[#f4efe6] p-3"
                    >
                      <div className="mb-2.5 flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-[#4a4043]">
                          {stage}
                        </h3>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-[#5b1e31]">
                          {colOrders.length}
                        </span>
                      </div>
                      <div className="space-y-2.5">
                        {colOrders.map((order) => (
                          <div
                            key={order.id}
                            onClick={() => setDetailOrder(order)}
                            className="cursor-pointer rounded-xl border border-[#e6ddd0] bg-white p-3 shadow-xs hover:border-[#5b1e31]"
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="rounded bg-[#5b1e31] px-1.5 py-0.5 text-[10px] font-bold text-white">
                                #{order.serial_no}
                              </span>
                              <span className="text-[11px] font-semibold text-[#5b1e31]">
                                {formatINR(order.balance_due)} due
                              </span>
                            </div>
                            <p className="mt-1.5 text-sm font-bold text-[#1f1a1c]">
                              {order.customer_name}
                            </p>
                            <p className="text-[11px] text-[#6d6265]">
                              {order.garment_type || "Tailoring"} •{" "}
                              {order.delivery_date}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Customers Directory Tab */}
        {activeTab === "customers" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e6ddd0] bg-white p-4">
              <div>
                <h2 className="text-base font-bold text-[#1f1a1c]">
                  Customer Measurement Directory
                </h2>
                <p className="text-xs text-[#6d6265]">
                  Reuse saved measurements from a customer&apos;s latest verified slip in one click.
                </p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a7d80]" />
                <input
                  type="text"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search customer or phone..."
                  className="w-full rounded-xl border border-[#e6ddd0] bg-[#faf7f2] pl-9 pr-3 py-2 text-sm outline-none focus:border-[#5b1e31]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {filteredCustomers.map((c) => (
                <div
                  key={c.key}
                  onClick={() => setDetailCustomerId(c.id)}
                  className="cursor-pointer rounded-2xl border border-[#e6ddd0] bg-white p-4 shadow-xs transition hover:border-[#5b1e31]/50 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-base font-bold text-[#1f1a1c]">
                        {c.customer_name}
                      </h3>
                      <p className="text-xs text-[#6d6265]">
                        {c.phone} {c.address ? `• ${c.address}` : ""}
                      </p>
                    </div>
                    <span className="rounded-full bg-[#faf7f2] px-2.5 py-0.5 text-[11px] font-semibold text-[#5b1e31] border border-[#e6ddd0]">
                      {c.order_count} {c.order_count === 1 ? "order" : "orders"}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-1.5 rounded-xl bg-[#faf7f2] p-2.5 text-[11px]">
                    <div>
                      <span className="text-[#6d6265]">Length:</span>{" "}
                      <strong>{c.latest_measurements.length || "—"}</strong>
                    </div>
                    <div>
                      <span className="text-[#6d6265]">Chest:</span>{" "}
                      <strong>{c.latest_measurements.chest || "—"}</strong>
                    </div>
                    <div>
                      <span className="text-[#6d6265]">Waist:</span>{" "}
                      <strong>{c.latest_measurements.waist || "—"}</strong>
                    </div>
                    <div>
                      <span className="text-[#6d6265]">Hip:</span>{" "}
                      <strong>{c.latest_measurements.hip || "—"}</strong>
                    </div>
                    <div>
                      <span className="text-[#6d6265]">Sleeve:</span>{" "}
                      <strong>{c.latest_measurements.sleeve || "—"}</strong>
                    </div>
                    <div>
                      <span className="text-[#6d6265]">Last:</span>{" "}
                      <strong>#{c.latest_serial_no || "—"}</strong>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2 pt-1 text-xs">
                    <div>
                      <span className="text-[#6d6265]">Total Spent:</span>{" "}
                      <strong>{formatINR(c.total_spent)}</strong>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailCustomerId(c.id);
                        }}
                        className="rounded-xl border border-[#e6ddd0] bg-[#faf7f2] px-2.5 py-1.5 text-xs font-semibold text-[#4a4043] hover:border-[#5b1e31]"
                      >
                        History
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openNewOrderForCustomer(c);
                        }}
                        className="inline-flex items-center gap-1 rounded-xl bg-[#5b1e31] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#471625]"
                      >
                        <Plus className="h-3.5 w-3.5" /> Append Order
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === "settings" && (
          <div className="mx-auto max-w-2xl space-y-5">
            <form
              onSubmit={handleSaveSettings}
              className="rounded-2xl border border-[#e6ddd0] bg-white p-5 shadow-xs space-y-4"
            >
              <div>
                <h2 className="text-base font-bold text-[#1f1a1c]">
                  Boutique Profile &amp; Receipt Branding
                </h2>
                <p className="text-xs text-[#6d6265]">
                  Shown on printable tailoring slips and WhatsApp customer updates.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-[#4a4043]">
                  Shop Name
                </label>
                <input
                  type="text"
                  value={shopNameInput}
                  onChange={(e) => setShopNameInput(e.target.value)}
                  className="w-full rounded-xl border border-[#e6ddd0] px-3 py-2 text-sm outline-none focus:border-[#5b1e31]"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#4a4043]">
                    Shop Phone
                  </label>
                  <input
                    type="text"
                    value={shopPhoneInput}
                    onChange={(e) => setShopPhoneInput(e.target.value)}
                    className="w-full rounded-xl border border-[#e6ddd0] px-3 py-2 text-sm outline-none focus:border-[#5b1e31]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#4a4043]">
                    Shop Address
                  </label>
                  <input
                    type="text"
                    value={shopAddressInput}
                    onChange={(e) => setShopAddressInput(e.target.value)}
                    className="w-full rounded-xl border border-[#e6ddd0] px-3 py-2 text-sm outline-none focus:border-[#5b1e31]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                {settingsMessage ? (
                  <span className="text-xs font-semibold text-emerald-700">
                    {settingsMessage}
                  </span>
                ) : (
                  <span />
                )}
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="rounded-xl bg-[#5b1e31] px-4 py-2 text-xs font-semibold text-white hover:bg-[#471625] disabled:opacity-60"
                >
                  {savingSettings ? "Saving..." : "Save Shop Settings"}
                </button>
              </div>
            </form>

            {/* Gemini AI Vision OCR Setup */}
            <div className="rounded-2xl border border-[#e6ddd0] bg-white p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#b47b2b]" />
                  <h2 className="text-base font-bold text-[#1f1a1c]">
                    Gemini AI Vision OCR (Hindi + English)
                  </h2>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    hasEnvGeminiKey || sessionGeminiKey.trim()
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-amber-50 text-amber-800 border border-amber-200"
                  }`}
                >
                  {hasEnvGeminiKey
                    ? "Configured via .env.local"
                    : sessionGeminiKey.trim()
                    ? "Session Key Active"
                    : "Not Configured"}
                </span>
              </div>

              <p className="text-xs text-[#6d6265]">
                For permanent setup, add{" "}
                <code className="rounded bg-[#faf7f2] px-1.5 py-0.5 font-mono text-[11px]">
                  GEMINI_API_KEY=your_key
                </code>{" "}
                to <code className="font-mono text-[11px]">.env.local</code> and
                restart the dev server. Or paste a temporary session key below to
                test AI slip scanning right away (kept in browser memory only):
              </p>

              <input
                type="password"
                value={sessionGeminiKey}
                onChange={(e) => setSessionGeminiKey(e.target.value)}
                placeholder="AIza... (optional session Gemini API key)"
                className="w-full rounded-xl border border-[#e6ddd0] px-3 py-2 text-sm font-mono outline-none focus:border-[#5b1e31]"
              />
            </div>
          </div>
        )}
      </main>

      {/* Modals & Drawers */}
      {formOpen && (
        <OrderFormModal
          key={editingOrder ? `edit-${editingOrder.id}` : `new-${nextSerialNo}-${prefillCustomer?.phone ?? "blank"}`}
          open={formOpen}
          editingOrder={editingOrder}
          prefillCustomer={prefillCustomer}
          prefillMeasurements={prefillMeasurements}
          defaultSerialNo={nextSerialNo}
          customers={customers}
          hasEnvGeminiKey={hasEnvGeminiKey}
          sessionGeminiKey={sessionGeminiKey}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            void refreshData();
          }}
          onOpenSettings={() => {
            setFormOpen(false);
            setActiveTab("settings");
          }}
        />
      )}

      <OrderDetailDrawer
        order={detailOrder}
        settings={settings}
        customerOrderCount={
          detailOrder?.customer_id
            ? customers.find((c) => c.id === detailOrder.customer_id)?.order_count
            : undefined
        }
        onClose={() => setDetailOrder(null)}
        onEdit={(order) => {
          setDetailOrder(null);
          setEditingOrder(order);
          setFormOpen(true);
        }}
        onChangeStatus={handleStatusChange}
        onDelete={handleDeleteOrder}
        onPrint={(order) => setPrintOrder(order)}
        onOpenCustomer={(order) => {
          setDetailOrder(null);
          const match = customers.find(
            (c) =>
              c.id === order.customer_id ||
              c.phone === order.phone
          );
          if (match) {
            setDetailCustomerId(match.id);
          }
        }}
        onAppendForCustomer={(order) => {
          const match = customers.find(
            (c) =>
              c.id === order.customer_id ||
              c.phone === order.phone
          );
          if (match) {
            openNewOrderForCustomer(match);
          } else {
            setDetailOrder(null);
            setEditingOrder(null);
            setPrefillCustomer({
              name: order.customer_name,
              phone: order.phone,
              address: order.address,
            });
            setPrefillMeasurements(undefined);
            setFormOpen(true);
          }
        }}
      />

      {detailCustomer && (
        <CustomerDetailDrawer
          key={detailCustomer.id}
          customer={detailCustomer}
          onClose={() => setDetailCustomerId(null)}
          onAppendNewOrder={(customer, copyMeasurements) =>
            openNewOrderForCustomer(customer, copyMeasurements)
          }
          onOpenOrder={(order) => {
            setDetailCustomerId(null);
            setDetailOrder(order);
          }}
          onCustomerUpdated={refreshData}
        />
      )}

      <PrintReceiptModal
        order={printOrder}
        settings={settings}
        onClose={() => setPrintOrder(null)}
      />
    </div>
  );
}
