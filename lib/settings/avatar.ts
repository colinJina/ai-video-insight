import { ValidationError } from "@/lib/analysis/errors";

export const MAX_AVATAR_FILE_BYTES = 1024 * 1024;

const DATA_URL_PATTERN = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i;
const ALLOWED_AVATAR_MIME_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function normalizeAvatarDataUrl(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";

  if (!trimmed) {
    return null;
  }

  if (!trimmed.startsWith("data:")) {
    throw new ValidationError("Please upload an image file instead of using a remote avatar URL.");
  }

  const match = DATA_URL_PATTERN.exec(trimmed);

  if (!match) {
    throw new ValidationError("Avatar images must be a valid PNG, JPG, WEBP, or GIF file.");
  }

  const mimeType = match[1].toLowerCase();
  const base64Payload = match[2];

  if (!ALLOWED_AVATAR_MIME_TYPES.has(mimeType)) {
    throw new ValidationError("Avatar images must be PNG, JPG, WEBP, or GIF files.");
  }

  const fileSizeInBytes = Buffer.from(base64Payload, "base64").byteLength;

  if (fileSizeInBytes > MAX_AVATAR_FILE_BYTES) {
    throw new ValidationError("Avatar images must be 1 MB or smaller.");
  }

  return trimmed;
}

export function isInlineAvatarSrc(value: string | null | undefined) {
  return (value?.startsWith("data:") ?? false);
}
