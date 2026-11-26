import { NextRequest, NextResponse } from "next/server";
import { getOrderById, getSettings } from "@/lib/db";
import { normalizeIndianPhone } from "@/lib/types";

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const GRAPH_API_BASE = "https://graph.facebook.com";

type MetaResponse = {
  id?: string;
  messages?: { id: string }[];
  error?: {
    message?: string;
    code?: number;
  };
};

type RouteContext = { params: Promise<{ id: string }> };

async function readMetaResponse(response: Response): Promise<MetaResponse> {
  let result: MetaResponse;
  try {
    result = (await response.json()) as MetaResponse;
  } catch {
    throw new Error("WhatsApp Cloud API returned an unreadable response.");
  }
  if (!response.ok || result.error) {
    const error = result.error;
    if (error?.code === 131047) {
      throw new Error(
        "WhatsApp requires an approved receipt template because the 24-hour customer-service window is closed. Configure WHATSAPP_RECEIPT_TEMPLATE_NAME and WHATSAPP_RECEIPT_TEMPLATE_LANGUAGE."
      );
    }
    throw new Error(error?.message || "WhatsApp Cloud API request failed.");
  }
  return result;
}

export async function POST(request: NextRequest, context: RouteContext) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_PDF_BYTES + 64 * 1024) {
    return NextResponse.json(
      { error: "The receipt PDF must be smaller than 10 MB." },
      { status: 413 }
    );
  }

  const { id } = await context.params;
  const orderId = Number(id);
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return NextResponse.json({ error: "Invalid order ID." }, { status: 400 });
  }

  const order = await getOrderById(orderId);
  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  const recipient = normalizeIndianPhone(order.phone);
  if (!/^\d{10,15}$/.test(recipient)) {
    return NextResponse.json(
      { error: "This customer does not have a valid WhatsApp phone number." },
      { status: 400 }
    );
  }

  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const apiVersion =
    process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || "v27.0";

  if (!accessToken || !phoneNumberId) {
    return NextResponse.json(
      {
        error:
          "WhatsApp Cloud API is not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID on the server, then restart the app.",
      },
      { status: 503 }
    );
  }
  if (!/^\d+$/.test(phoneNumberId) || !/^v\d+\.\d+$/.test(apiVersion)) {
    return NextResponse.json(
      { error: "WhatsApp Cloud API configuration has an invalid phone ID or API version." },
      { status: 500 }
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Send the receipt as a multipart PDF file." },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.type !== "application/pdf") {
    return NextResponse.json(
      { error: "A PDF receipt file is required." },
      { status: 400 }
    );
  }
  if (file.size === 0 || file.size > MAX_PDF_BYTES) {
    return NextResponse.json(
      { error: "The receipt PDF must be smaller than 10 MB." },
      { status: 400 }
    );
  }

  const bytes = await file.arrayBuffer();
  const signature = new TextDecoder().decode(bytes.slice(0, 5));
  if (signature !== "%PDF-") {
    return NextResponse.json(
      { error: "The uploaded file is not a valid PDF." },
      { status: 400 }
    );
  }

  const filename = `tailoring-receipt-${order.serial_no.replace(
    /[^a-zA-Z0-9_-]/g,
    "-"
  )}.pdf`;
  const mediaForm = new FormData();
  mediaForm.append("messaging_product", "whatsapp");
  mediaForm.append("type", "application/pdf");
  mediaForm.append(
    "file",
    new Blob([bytes], { type: "application/pdf" }),
    filename
  );

  try {
    const mediaResponse = await fetch(
      `${GRAPH_API_BASE}/${apiVersion}/${phoneNumberId}/media`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: mediaForm,
        signal: AbortSignal.timeout(30_000),
      }
    );
    const media = await readMetaResponse(mediaResponse);
    if (!media.id) {
      throw new Error("WhatsApp did not return an uploaded receipt ID.");
    }

    const templateName = process.env.WHATSAPP_RECEIPT_TEMPLATE_NAME?.trim();
    const templateLanguage =
      process.env.WHATSAPP_RECEIPT_TEMPLATE_LANGUAGE?.trim() || "en";
    const settings = await getSettings();
    const caption = `${settings.shop_name || "Boutique"} digital receipt #${order.serial_no}`;
    const message = templateName
      ? {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: recipient,
          type: "template",
          template: {
            name: templateName,
            language: { code: templateLanguage },
            components: [
              {
                type: "header",
                parameters: [
                  {
                    type: "document",
                    document: { id: media.id, filename },
                  },
                ],
              },
            ],
          },
        }
      : {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: recipient,
          type: "document",
          document: { id: media.id, filename, caption },
        };

    const sendResponse = await fetch(
      `${GRAPH_API_BASE}/${apiVersion}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(30_000),
      }
    );
    const result = await readMetaResponse(sendResponse);
    return NextResponse.json({
      sent: true,
      recipient,
      messageId: result.messages?.[0]?.id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not send the receipt through WhatsApp Cloud API.",
      },
      { status: 502 }
    );
  }
}
