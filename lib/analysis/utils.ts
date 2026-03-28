import { TimeoutError, ValidationError } from "@/lib/analysis/errors";
import type {
  TranscriptSegment,
  VideoProvider,
} from "@/lib/analysis/types";

const DIRECT_VIDEO_FILE_PATTERN = /\.(mp4|webm|ogg|mov|m4v)(?:$|[?#])/i;

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function trimText(value: string, maxLength: number) {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function decodeHtmlEntities(value: string) {
  return value.replace(
    /&(amp|quot|#39|apos|lt|gt);/g,
    (entity) => HTML_ENTITIES[entity] ?? entity,
  );
}

export function assertValidVideoUrl(value: string) {
  const input = value.trim();
  if (!input) {
    throw new ValidationError("请输入视频链接。");
  }

  let url: URL;

  try {
    url = new URL(input);
  } catch {
    throw new ValidationError("请输入合法的 HTTP 或 HTTPS 视频链接。");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ValidationError("目前仅支持 HTTP 或 HTTPS 视频链接。");
  }

  return url;
}

export function normalizeVideoUrl(url: URL) {
  const normalized = new URL(url.toString());
  normalized.hash = "";
  return normalized.toString();
}

export function toHostLabel(hostname: string) {
  return hostname.replace(/^www\./i, "");
}

export function detectVideoProvider(url: URL): VideoProvider {
  const host = toHostLabel(url.hostname).toLowerCase();

  if (isDirectMediaUrl(url)) {
    return "direct";
  }

  if (host.includes("youtube.com") || host.includes("youtu.be")) {
    return "youtube";
  }

  if (host.includes("vimeo.com")) {
    return "vimeo";
  }

  if (host.includes("bilibili.com") || host.includes("b23.tv")) {
    return "bilibili";
  }

  return "generic";
}

export function isDirectMediaUrl(url: URL | string) {
  const href = typeof url === "string" ? url : url.toString();
  return DIRECT_VIDEO_FILE_PATTERN.test(href);
}

export function prettifyTitleFromUrl(url: URL, provider: VideoProvider) {
  if (provider === "youtube") {
    const id =
      url.searchParams.get("v") ?? url.pathname.split("/").filter(Boolean).pop();
    return id ? `YouTube 视频 ${id.slice(0, 8)}` : "YouTube 视频";
  }

  if (provider === "vimeo") {
    const id = url.pathname.split("/").filter(Boolean).pop();
    return id ? `Vimeo 视频 ${id}` : "Vimeo 视频";
  }

  if (provider === "bilibili") {
    return "哔哩哔哩视频";
  }

  const lastSegment = url.pathname.split("/").filter(Boolean).pop();
  if (lastSegment) {
    const cleaned = decodeURIComponent(lastSegment)
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]+/g, " ")
      .trim();

    if (cleaned) {
      return cleaned;
    }
  }

  return `${toHostLabel(url.hostname)} 视频`;
}

export function formatTimestamp(totalSeconds: number | null | undefined) {
  if (typeof totalSeconds !== "number" || !Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "00:00";
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function coerceTimestamp(value: unknown, fallback: string | null) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return formatTimestamp(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (/^\d+$/.test(trimmed)) {
      return formatTimestamp(Number(trimmed));
    }

    const parts = trimmed.split(":").map((part) => Number(part));
    if (parts.every((part) => Number.isFinite(part))) {
      const seconds = parts.reduce((total, part) => total * 60 + part, 0);
      return formatTimestamp(seconds);
    }
  }

  return fallback;
}

export function normalizeDurationSeconds(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return value;
}

export function hasUsableTimestamp(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function pickStringArray(value: unknown, limit: number) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? normalizeWhitespace(item) : ""))
    .filter(Boolean)
    .slice(0, limit);
}

export function buildTranscriptExcerpt(
  segments: TranscriptSegment[],
  maxLength: number,
) {
  return trimText(
    segments
      .map((segment) => {
        const startSeconds = segment.startSeconds;
        return hasUsableTimestamp(startSeconds)
          ? `[${formatTimestamp(startSeconds)}] ${segment.text}`
          : segment.text;
      })
      .join(" "),
    maxLength,
  );
}

export function toAbsoluteUrl(maybeUrl: string, baseUrl: URL) {
  try {
    return new URL(maybeUrl, baseUrl).toString();
  } catch {
    return null;
  }
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 10000,
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError")
    ) {
      throw new TimeoutError("请求超时，请稍后重试。");
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
