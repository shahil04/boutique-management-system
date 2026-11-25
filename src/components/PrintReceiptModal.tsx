"use client";
/* eslint-disable @next/next/no-img-element */

import React, { useRef, useState } from "react";
import { MessageCircle, Printer, X } from "lucide-react";
import {
  BoutiqueOrder,
  MEASUREMENT_FIELDS,
  ShopSettings,
  buildWhatsAppMessage,
  buildWhatsAppUrl,
  formatINR,
} from "@/lib/types";

interface PrintReceiptModalProps {
  order: BoutiqueOrder | null;
  settings: ShopSettings;
  onClose: () => void;
}

export default function PrintReceiptModal({
  order,
  settings,
  onClose,
}: PrintReceiptModalProps) {
  const receiptRef = useRef<HTMLDivElement | null>(null);
  const [sharing, setSharing] = useState(false);
  const [shareMessage, setShareMessage] = useState("");

  if (!order) return null;

  const createReceiptPdf = async (): Promise<File> => {
    const receipt = receiptRef.current;
    if (!receipt) {
      throw new Error("Receipt is not ready to export.");
    }

    const images = Array.from(receipt.querySelectorAll("img"));
    if (images.some((image) => !image.complete || image.naturalWidth === 0)) {
      throw new Error("Wait for all receipt photos to load, then try again.");
    }

    const { default: html2pdf } = await import("html2pdf.js");
    const filename = `tailoring-receipt-${order.serial_no.replace(
      /[^a-zA-Z0-9_-]/g,
      "-"
    )}.pdf`;
    const pdf = await html2pdf()
      .set({
        margin: 8,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          backgroundColor: "#ffffff",
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      })
      .from(receipt)
      .outputPdf("blob");

    if (!(pdf instanceof Blob)) {
      throw new Error("Could not generate the receipt PDF.");
    }

    return new File([pdf], filename, { type: "application/pdf" });
  };

  const handleSharePdf = async () => {
    setSharing(true);
    setShareMessage("");

    const message = buildWhatsAppMessage(order, settings.shop_name, "receipt");
    const testFile = new File([""], "receipt.pdf", {
      type: "application/pdf",
    });
    const canShareFile = (() => {
      try {
        return (
          typeof navigator.share === "function" &&
          typeof navigator.canShare === "function" &&
          navigator.canShare({ files: [testFile] })
        );
      } catch {
        return false;
      }
    })();
    const whatsappWindow = canShareFile
      ? null
      : window.open(
          buildWhatsAppUrl(
            order.phone,
            `${message}\n\nPlease find the PDF receipt attached.`
          ),
          "_blank"
        );
    if (whatsappWindow) {
      whatsappWindow.opener = null;
    }

    try {
      const file = await createReceiptPdf();

      if (canShareFile) {
        await navigator.share({
          files: [file],
          title: `Tailoring Receipt #${order.serial_no}`,
          text: message,
        });
        setShareMessage("Choose WhatsApp and select the customer to send the PDF.");
      } else {
        const downloadUrl = URL.createObjectURL(file);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = file.name;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 60_000);
        setShareMessage(
          whatsappWindow
            ? "PDF downloaded. Attach it to the WhatsApp message that opened."
            : "PDF downloaded. WhatsApp could not be opened automatically; attach the PDF in the customer's chat."
        );
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        setShareMessage("PDF sharing was cancelled.");
      } else {
        setShareMessage(
          error instanceof Error ? error.message : "Could not share the receipt PDF."
        );
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="no-print flex items-center justify-between border-b border-[#e6ddd0] px-5 py-3">
          <h3 className="text-sm font-semibold text-[#1f1a1c]">
            Printable Tailoring Slip — #{order.serial_no}
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSharePdf()}
              disabled={sharing}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
            >
              <MessageCircle className="h-4 w-4" />
              {sharing ? "Preparing PDF..." : "Share PDF"}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#5b1e31] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#471625]"
            >
              <Printer className="h-4 w-4" /> Print / Save PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-[#6d6265] hover:bg-gray-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {shareMessage && (
          <p
            role="status"
            className="no-print border-b border-[#e6ddd0] bg-[#faf7f2] px-5 py-2 text-xs text-[#4a4043]"
          >
            {shareMessage}
          </p>
        )}

        <div ref={receiptRef} className="bg-white p-6 text-[#1f1a1c]">
          <div className="border-b-2 border-[#5b1e31] pb-4 text-center">
            <h1 className="text-xl font-bold text-[#5b1e31]">
              {settings.shop_name}
            </h1>
            {(settings.shop_address || settings.shop_phone) && (
              <p className="mt-0.5 text-xs text-[#6d6265]">
                {[settings.shop_address, settings.shop_phone]
                  .filter(Boolean)
                  .join(" • ")}
              </p>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border border-[#e6ddd0] bg-[#faf7f2] p-3 text-xs">
            <div>
              <p>
                <span className="text-[#6d6265]">Serial No:</span>{" "}
                <strong className="text-sm">#{order.serial_no}</strong>
              </p>
              <p className="mt-1">
                <span className="text-[#6d6265]">Customer:</span>{" "}
                <strong>{order.customer_name}</strong>
              </p>
              <p className="mt-1">
                <span className="text-[#6d6265]">Phone:</span> {order.phone}
              </p>
              {order.address && (
                <p className="mt-1">
                  <span className="text-[#6d6265]">Address:</span>{" "}
                  {order.address}
                </p>
              )}
            </div>
            <div className="text-right">
              <p>
                <span className="text-[#6d6265]">Order Date:</span>{" "}
                {order.order_date}
              </p>
              <p className="mt-1">
                <span className="text-[#6d6265]">Delivery Date:</span>{" "}
                <strong className="text-[#5b1e31]">{order.delivery_date}</strong>
              </p>
              <p className="mt-1">
                <span className="text-[#6d6265]">Garment:</span>{" "}
                <strong>{order.garment_type || "Custom Tailoring"}</strong>
              </p>
              <p className="mt-1">
                <span className="text-[#6d6265]">Stage:</span> {order.status}
              </p>
            </div>
          </div>

          {(order.slip_photo_url || order.design_photos.length > 0) && (
            <div className="mt-4 break-inside-avoid">
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#5b1e31]">
                Slip &amp; Design References
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {order.slip_photo_url && (
                  <figure className="rounded-lg border border-[#e6ddd0] p-2">
                    <img
                      src={order.slip_photo_url}
                      alt="Original tailoring slip"
                      className="h-40 w-full object-contain"
                    />
                    <figcaption className="mt-1 text-[10px] text-[#6d6265]">
                      Original Slip
                    </figcaption>
                  </figure>
                )}
                {order.design_photos.map((photo, index) => (
                  <figure
                    key={`${photo.url}-${index}`}
                    className="rounded-lg border border-[#e6ddd0] p-2"
                  >
                    <img
                      src={photo.url}
                      alt={photo.label}
                      className="h-40 w-full object-contain"
                    />
                    <figcaption className="mt-1 text-[10px] text-[#6d6265]">
                      {photo.label} ({photo.kind})
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          )}

          {/* Measurements Summary */}
          <div className="mt-4">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#5b1e31]">
              Measurements (नाप)
            </h4>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {MEASUREMENT_FIELDS.map((f) => (
                <div
                  key={f.key}
                  className="rounded-lg border border-[#e6ddd0] px-2.5 py-1.5 text-xs"
                >
                  <div className="text-[10px] text-[#6d6265]">
                    {f.label} ({f.hindi})
                  </div>
                  <div className="font-semibold">
                    {order.measurements[f.key] || "—"}
                  </div>
                </div>
              ))}
            </div>
            {order.measurements.extra_notes && (
              <p className="mt-2 rounded-lg border border-[#e6ddd0] bg-[#faf7f2] p-2.5 text-xs">
                <strong>Notes:</strong> {order.measurements.extra_notes}
              </p>
            )}
          </div>

          {/* Billing Table */}
          <div className="mt-4">
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-[#5b1e31]">
              Charges &amp; Balance
            </h4>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#e6ddd0] text-left text-[#6d6265]">
                  <th className="py-1.5">Description</th>
                  <th className="py-1.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {order.items.length > 0 ? (
                  order.items.map((item, idx) => (
                    <tr key={idx} className="border-b border-[#f1ebe2]">
                      <td className="py-1.5">{item.description}</td>
                      <td className="py-1.5 text-right font-medium">
                        {formatINR(item.amount)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="border-b border-[#f1ebe2]">
                    <td className="py-1.5">Tailoring Charges</td>
                    <td className="py-1.5 text-right font-medium">
                      {formatINR(order.total_amount)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="mt-3 flex justify-end">
              <div className="w-56 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#6d6265]">Total:</span>
                  <span className="font-bold">{formatINR(order.total_amount)}</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>Advance Paid:</span>
                  <span className="font-semibold">
                    {formatINR(order.advance_paid)}
                  </span>
                </div>
                <div className="flex justify-between border-t border-[#e6ddd0] pt-1 text-sm font-bold text-[#5b1e31]">
                  <span>Balance Due:</span>
                  <span>{formatINR(order.balance_due)}</span>
                </div>
              </div>
            </div>
          </div>

          <p className="mt-6 border-t border-dashed border-[#e6ddd0] pt-3 text-center text-[11px] text-[#6d6265]">
            Thank you for visiting {settings.shop_name}! Please bring this slip at delivery.
          </p>
        </div>
      </div>
    </div>
  );
}
