import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI, Type } from "@google/genai";
import { readUploadAsBase64 } from "@/lib/uploads";
import { EMPTY_MEASUREMENTS, OcrExtractionResult } from "@/lib/types";

const OCR_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    serial_no: { type: Type.STRING },
    customer_name: { type: Type.STRING },
    phone: { type: Type.STRING },
    address: { type: Type.STRING },
    garment_type: { type: Type.STRING },
    order_date: { type: Type.STRING },
    delivery_date: { type: Type.STRING },
    measurements: {
      type: Type.OBJECT,
      properties: {
        length: { type: Type.STRING },
        chest: { type: Type.STRING },
        waist: { type: Type.STRING },
        hip: { type: Type.STRING },
        sleeve: { type: Type.STRING },
        front_neck: { type: Type.STRING },
        back_neck: { type: Type.STRING },
        border: { type: Type.STRING },
        shoulder: { type: Type.STRING },
        bottom: { type: Type.STRING },
        extra_notes: { type: Type.STRING },
      },
      required: [
        "length",
        "chest",
        "waist",
        "hip",
        "sleeve",
        "front_neck",
        "back_neck",
        "border",
        "shoulder",
        "bottom",
        "extra_notes",
      ],
    },
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          description: { type: Type.STRING },
          amount: { type: Type.NUMBER },
        },
        required: ["description", "amount"],
      },
    },
    total_amount: { type: Type.NUMBER, nullable: true },
    advance_paid: { type: Type.NUMBER, nullable: true },
    balance_due: { type: Type.NUMBER, nullable: true },
    uncertain_fields: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
    raw_text_summary: { type: Type.STRING },
  },
  required: [
    "serial_no",
    "customer_name",
    "phone",
    "address",
    "garment_type",
    "order_date",
    "delivery_date",
    "measurements",
    "items",
    "uncertain_fields",
    "raw_text_summary",
  ],
};

function buildOcrPrompt(todayIso: string): string {
  return `You are an expert Indian boutique & tailoring slip OCR assistant.
Analyze the attached photo of a handwritten or printed tailoring receipt / cash memo / measurement slip.
The handwriting may be in English, Hindi (Devanagari), or Hinglish.

Extract every visible detail into the JSON schema:
1. Customer & Order fields:
   - serial_no: Slip/Bill/Receipt/S.No number (digits/text only, no '#' prefix).
   - customer_name: Customer name.
   - phone: Mobile/WhatsApp number (digits only if readable).
   - address: Customer address if written.
   - garment_type: e.g. Suit, Blouse, Anarkali, Kurti, Lehenga, Gown, Salwar, Alteration.
   - order_date & delivery_date: Convert to YYYY-MM-DD. If year is omitted (e.g. "25/11"), infer the nearest realistic year around today (${todayIso}). Return "" if not written.

2. Tailoring Measurements (preserve inches/fractions like 36.5, 14 1/2, or Hindi/English notes):
   - length (लम्बाई / L)
   - chest (सीना / Ch / Bust)
   - waist (कमर / W)
   - hip (हिप / H)
   - sleeve (बाजू / आस्तीन / Sl — e.g. "16 / 4.5")
   - front_neck (आगे का गला / F.N)
   - back_neck (पीछे का गला / B.N)
   - border (बॉर्डर / लैस / पाइपिंग)
   - shoulder (तीरा / Sh)
   - bottom (मोहरी / सलवार / पैंट)
   - extra_notes: Any other Hindi or English stitching/design instructions (e.g., अस्तर, हुक, डोरी, लटकन, गला डिज़ाइन).

3. Billing:
   - items: Array of { description, amount } for itemized charges.
   - total_amount, advance_paid, balance_due: Numeric values in INR (₹) or null if absent.

4. Double-Safety Verification:
   - uncertain_fields: List field keys (e.g. "phone", "measurements.chest", "delivery_date", "total_amount") where handwriting is faint, ambiguous, or crossed out so staff can verify against the slip image.
   - raw_text_summary: A concise verbatim transcription of key handwritten lines seen on the slip.

Never invent numbers or details that are not visible; leave missing text fields as "" and missing numbers as null.`;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      slipUrl?: string;
      imageBase64?: string;
      mimeType?: string;
    };

    const headerKey = request.headers.get("x-gemini-api-key")?.trim();
    const apiKey = headerKey || process.env.GEMINI_API_KEY?.trim();

    if (!apiKey) {
      return NextResponse.json(
        {
          code: "MISSING_API_KEY",
          error:
            "GEMINI_API_KEY is not configured. Add GEMINI_API_KEY to .env.local (or enter a temporary key in OCR Settings), or enter measurements manually beside the slip photo.",
        },
        { status: 400 }
      );
    }

    let base64 = "";
    let mimeType = "image/jpeg";

    if (body.slipUrl) {
      const loaded = await readUploadAsBase64(body.slipUrl);
      if (!loaded) {
        return NextResponse.json(
          { error: "Attached slip photo could not be found in storage." },
          { status: 404 }
        );
      }
      base64 = loaded.base64;
      mimeType = loaded.mimeType;
    } else if (body.imageBase64) {
      const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(
        body.imageBase64
      );
      if (match) {
        mimeType = match[1];
        base64 = match[2];
      } else {
        base64 = body.imageBase64;
        mimeType = body.mimeType || "image/jpeg";
      }
    } else {
      return NextResponse.json(
        { error: "Provide slipUrl or imageBase64 to run AI Vision OCR." },
        { status: 400 }
      );
    }

    const todayIso = new Date().toISOString().slice(0, 10);
    const ai = new GoogleGenAI({ apiKey });
    const primaryModel = process.env.GEMINI_MODEL?.trim() || "gemini-3.5-flash";
    const candidateModels = Array.from(
      new Set([
        primaryModel,
        "gemini-3.5-flash",
        "gemini-3.8-flash",
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
      ])
    );

    let usedModel = primaryModel;
    let rawText = "{}";
    let lastError: unknown = null;

    for (const model of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents: [
            {
              role: "user",
              parts: [
                { text: buildOcrPrompt(todayIso) },
                {
                  inlineData: {
                    mimeType,
                    data: base64,
                  },
                },
              ],
            },
          ],
          config: {
            httpOptions: { timeout: 15000 },
            responseMimeType: "application/json",
            responseSchema: OCR_RESPONSE_SCHEMA,
            temperature: 0.1,
          },
        });
        usedModel = model;
        rawText = response.text?.trim() ?? "{}";
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        const name = err instanceof Error ? err.name : "";
        const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
        const isRetryable =
          name === "AbortError" ||
          msg.includes("abort") ||
          msg.includes("timeout") ||
          msg.includes("timed out") ||
          msg.includes("503") ||
          msg.includes("unavailable") ||
          msg.includes("404") ||
          msg.includes("not_found") ||
          msg.includes("429");
        if (!isRetryable) {
          throw err;
        }
      }
    }

    if (lastError) {
      throw lastError;
    }

    const parsed = JSON.parse(rawText) as Partial<OcrExtractionResult>;

    const result: OcrExtractionResult = {
      serial_no: parsed.serial_no ?? "",
      customer_name: parsed.customer_name ?? "",
      phone: parsed.phone ?? "",
      address: parsed.address ?? "",
      garment_type: parsed.garment_type ?? "",
      order_date: parsed.order_date ?? "",
      delivery_date: parsed.delivery_date ?? "",
      measurements: {
        ...EMPTY_MEASUREMENTS,
        ...(parsed.measurements ?? {}),
      },
      items: Array.isArray(parsed.items) ? parsed.items : [],
      total_amount:
        typeof parsed.total_amount === "number" ? parsed.total_amount : null,
      advance_paid:
        typeof parsed.advance_paid === "number" ? parsed.advance_paid : null,
      balance_due:
        typeof parsed.balance_due === "number" ? parsed.balance_due : null,
      uncertain_fields: Array.isArray(parsed.uncertain_fields)
        ? parsed.uncertain_fields
        : [],
      raw_text_summary: parsed.raw_text_summary ?? "",
    };

    return NextResponse.json({ extraction: result, model: usedModel });
  } catch (error) {
    console.error("POST /api/ocr failed:", error);
    const message =
      error instanceof Error ? error.message : "Gemini Vision OCR failed";
    return NextResponse.json(
      { error: `AI Vision OCR failed: ${message}` },
      { status: 500 }
    );
  }
}
