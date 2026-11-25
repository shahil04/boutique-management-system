import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const UPLOADS_DIR = path.join(process.cwd(), "data", "uploads");

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
};

const EXTENSION_MIMES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

export function ensureUploadsDir(): string {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
  return UPLOADS_DIR;
}

export function saveUploadedBuffer(
  buffer: Buffer,
  mimeType: string,
  prefix = "slip"
): { filename: string; url: string; filePath: string } {
  const dir = ensureUploadsDir();
  const safePrefix = prefix.replace(/[^a-z0-9_-]/gi, "").toLowerCase() || "file";
  const ext = MIME_EXTENSIONS[mimeType.toLowerCase()] ?? ".png";
  const filename = `${safePrefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, buffer);
  return {
    filename,
    url: `/api/files/${filename}`,
    filePath,
  };
}

export function resolveUploadPath(segments: string[]): {
  filePath: string;
  mimeType: string;
} | null {
  if (segments.length !== 1) return null;
  const filename = segments[0];
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) return null;

  const dir = ensureUploadsDir();
  const resolved = path.resolve(dir, filename);
  if (!resolved.startsWith(path.resolve(dir) + path.sep)) return null;
  if (!fs.existsSync(resolved)) return null;

  const ext = path.extname(filename).toLowerCase();
  return {
    filePath: resolved,
    mimeType: EXTENSION_MIMES[ext] ?? "application/octet-stream",
  };
}

export function readUploadAsBase64(url: string): {
  base64: string;
  mimeType: string;
} | null {
  if (!url.startsWith("/api/files/")) return null;
  const filename = url.slice("/api/files/".length);
  const resolved = resolveUploadPath([filename]);
  if (!resolved) return null;
  const bytes = fs.readFileSync(/*turbopackIgnore: true*/ resolved.filePath);
  return {
    base64: bytes.toString("base64"),
    mimeType: resolved.mimeType,
  };
}
