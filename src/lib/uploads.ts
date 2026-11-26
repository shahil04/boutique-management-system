import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import crypto from "node:crypto";

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

type S3Configuration = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
};

type UploadedFile = { buffer: Buffer; mimeType: string };

let s3Client: S3Client | null = null;

function getS3Configuration(): S3Configuration | null {
  const config: S3Configuration = {
    bucket: process.env.S3_BUCKET?.trim() ?? "",
    region: process.env.S3_REGION?.trim() ?? "",
    accessKeyId: process.env.S3_ACCESS_KEY_ID?.trim() ?? "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY?.trim() ?? "",
    endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
  };
  const requiredValues = [
    config.bucket,
    config.region,
    config.accessKeyId,
    config.secretAccessKey,
  ];
  const configuredValues = requiredValues.filter(Boolean).length;

  if (configuredValues === requiredValues.length) return config;
  if (configuredValues > 0 || process.env.NODE_ENV === "production") {
    throw new Error(
      "Configure S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY. S3_ENDPOINT is optional for AWS S3."
    );
  }
  return null;
}

function getS3(): { client: S3Client; config: S3Configuration } {
  const config = getS3Configuration();
  if (!config) {
    throw new Error("S3 storage is not configured.");
  }

  if (!s3Client) {
    s3Client = new S3Client({
      region: config.region,
      endpoint: config.endpoint,
      forcePathStyle: Boolean(config.endpoint),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  return { client: s3Client, config };
}

export async function saveUploadedBuffer(
  buffer: Buffer,
  mimeType: string,
  prefix = "slip"
): Promise<{ filename: string; url: string }> {
  const config = getS3Configuration();
  if (!config) {
    const local = await import("./uploads-local");
    const saved = local.saveUploadedBuffer(buffer, mimeType, prefix);
    return { filename: saved.filename, url: saved.url };
  }

  const safePrefix =
    prefix.replace(/[^a-z0-9_-]/gi, "").toLowerCase() || "file";
  const ext = MIME_EXTENSIONS[mimeType.toLowerCase()] ?? ".png";
  const filename = `${safePrefix}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}${ext}`;
  const { client, config: s3Config } = getS3();
  await client.send(
    new PutObjectCommand({
      Bucket: s3Config.bucket,
      Key: filename,
      Body: buffer,
      ContentType: mimeType || "image/jpeg",
    })
  );

  return { filename, url: `/api/files/${filename}` };
}

export async function getUploadedFile(
  segments: string[]
): Promise<UploadedFile | null> {
  if (
    segments.length !== 1 ||
    !/^[a-zA-Z0-9._-]+$/.test(segments[0])
  ) {
    return null;
  }

  const config = getS3Configuration();
  if (!config) {
    const local = await import("./uploads-local");
    return local.readUploadedFile(segments);
  }

  const { client, config: s3Config } = getS3();
  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: s3Config.bucket,
        Key: segments[0],
      })
    );
    if (!response.Body) {
      throw new Error("S3 returned an empty image response.");
    }

    return {
      buffer: Buffer.from(await response.Body.transformToByteArray()),
      mimeType:
        response.ContentType ||
        EXTENSION_MIMES[
          segments[0].slice(segments[0].lastIndexOf(".")).toLowerCase()
        ] ||
        "application/octet-stream",
    };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      ("name" in error && error.name === "NoSuchKey" ||
        "$metadata" in error &&
          typeof error.$metadata === "object" &&
          error.$metadata !== null &&
          "httpStatusCode" in error.$metadata &&
          error.$metadata.httpStatusCode === 404)
    ) {
      return null;
    }
    throw error;
  }
}

export async function readUploadAsBase64(url: string): Promise<{
  base64: string;
  mimeType: string;
} | null> {
  if (!url.startsWith("/api/files/")) return null;
  const filename = url.slice("/api/files/".length);

  const config = getS3Configuration();
  if (!config) {
    const local = await import("./uploads-local");
    return local.readUploadAsBase64(url);
  }

  const uploaded = await getUploadedFile([filename]);
  if (!uploaded) return null;
  return {
    base64: uploaded.buffer.toString("base64"),
    mimeType: uploaded.mimeType,
  };
}
