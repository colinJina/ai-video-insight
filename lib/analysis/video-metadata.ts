import type { VideoSource } from "@/lib/analysis/types";
import {
  assertValidVideoUrl,
  decodeHtmlEntities,
  detectVideoProvider,
  fetchWithTimeout,
  isDirectMediaUrl,
  normalizeDurationSeconds,
  normalizeVideoUrl,
  normalizeWhitespace,
  prettifyTitleFromUrl,
  toAbsoluteUrl,
  toHostLabel,
  trimText,
} from "@/lib/analysis/utils";

const DIRECT_VIDEO_PROBE_RANGE_BYTES = 1024 * 1024;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchMetaTag(
  html: string,
  key: string,
  attribute: "property" | "name",
) {
  const escaped = escapeRegExp(key);
  const patterns = [
    new RegExp(
      `<meta[^>]+${attribute}=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+${attribute}=["']${escaped}["'][^>]*>`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtmlEntities(match[1]);
    }
  }

  return null;
}

function matchTitleTag(html: string) {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match?.[1] ? decodeHtmlEntities(match[1]) : null;
}

function parseIso8601Duration(value: string | null) {
  if (!value) {
    return null;
  }

  const match = value.match(
    /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i,
  );

  if (!match) {
    const numeric = Number(value);
    return normalizeDurationSeconds(numeric);
  }

  const [, days = "0", hours = "0", minutes = "0", seconds = "0"] = match;
  const totalSeconds =
    Number(days) * 86400 +
    Number(hours) * 3600 +
    Number(minutes) * 60 +
    Number(seconds);

  return normalizeDurationSeconds(totalSeconds);
}

function parseJsonLdDuration(html: string) {
  const blocks = html.match(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );

  if (!blocks) {
    return null;
  }

  for (const block of blocks) {
    const rawJson = block
      .replace(/<script[^>]*>/i, "")
      .replace(/<\/script>/i, "")
      .trim();

    if (!rawJson) {
      continue;
    }

    try {
      const parsed = JSON.parse(rawJson) as unknown;
      const queue = Array.isArray(parsed) ? [...parsed] : [parsed];

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current || typeof current !== "object") {
          continue;
        }

        const record = current as Record<string, unknown>;
        const duration = parseIso8601Duration(
          typeof record.duration === "string" ? record.duration : null,
        );

        if (duration !== null) {
          return duration;
        }

        for (const value of Object.values(record)) {
          if (Array.isArray(value)) {
            queue.push(...value);
          } else if (value && typeof value === "object") {
            queue.push(value);
          }
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

function readMp4DurationFromBuffer(buffer: Buffer) {
  let offset = 0;

  while (offset + 8 <= buffer.length) {
    let atomSize = buffer.readUInt32BE(offset);
    const atomType = buffer.toString("ascii", offset + 4, offset + 8);
    let headerSize = 8;

    if (atomSize === 1) {
      if (offset + 16 > buffer.length) {
        return null;
      }

      atomSize = Number(buffer.readBigUInt64BE(offset + 8));
      headerSize = 16;
    } else if (atomSize === 0) {
      atomSize = buffer.length - offset;
    }

    if (!Number.isFinite(atomSize) || atomSize < headerSize) {
      return null;
    }

    if (atomType === "moov") {
      const moovStart = offset + headerSize;
      const moovEnd = Math.min(offset + atomSize, buffer.length);
      let childOffset = moovStart;

      while (childOffset + 8 <= moovEnd) {
        let childSize = buffer.readUInt32BE(childOffset);
        const childType = buffer.toString(
          "ascii",
          childOffset + 4,
          childOffset + 8,
        );
        let childHeaderSize = 8;

        if (childSize === 1) {
          if (childOffset + 16 > moovEnd) {
            return null;
          }

          childSize = Number(buffer.readBigUInt64BE(childOffset + 8));
          childHeaderSize = 16;
        } else if (childSize === 0) {
          childSize = moovEnd - childOffset;
        }

        if (!Number.isFinite(childSize) || childSize < childHeaderSize) {
          return null;
        }

        if (childType === "mvhd") {
          const version = buffer.readUInt8(childOffset + childHeaderSize);

          if (version === 1) {
            const timescale = buffer.readUInt32BE(childOffset + childHeaderSize + 20);
            const duration = Number(
              buffer.readBigUInt64BE(childOffset + childHeaderSize + 24),
            );

            return timescale > 0 ? normalizeDurationSeconds(duration / timescale) : null;
          }

          const timescale = buffer.readUInt32BE(childOffset + childHeaderSize + 12);
          const duration = buffer.readUInt32BE(childOffset + childHeaderSize + 16);

          return timescale > 0 ? normalizeDurationSeconds(duration / timescale) : null;
        }

        childOffset += childSize;
      }
    }

    offset += atomSize;
  }

  return null;
}

async function fetchBufferRange(url: URL, rangeHeader: string) {
  const response = await fetchWithTimeout(
    url,
    {
      headers: {
        Range: rangeHeader,
        "User-Agent":
          "Mozilla/5.0 (compatible; VideoAnalyzerBot/1.0; +https://example.com)",
      },
    },
    8000,
  );

  if (!response.ok && response.status !== 206) {
    return null;
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function probeDirectVideoDuration(url: URL) {
  try {
    const headResponse = await fetchWithTimeout(
      url,
      {
        method: "HEAD",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; VideoAnalyzerBot/1.0; +https://example.com)",
        },
      },
      4500,
    );

    const explicitDuration =
      parseIso8601Duration(headResponse.headers.get("content-duration")) ??
      normalizeDurationSeconds(
        Number(headResponse.headers.get("x-content-duration") ?? ""),
      );

    if (explicitDuration !== null) {
      return explicitDuration;
    }

    const contentLength = Number(headResponse.headers.get("content-length") ?? "");
    const firstChunk = await fetchBufferRange(
      url,
      `bytes=0-${DIRECT_VIDEO_PROBE_RANGE_BYTES - 1}`,
    );

    if (firstChunk) {
      const durationFromStart = readMp4DurationFromBuffer(firstChunk);
      if (durationFromStart !== null) {
        return durationFromStart;
      }
    }

    if (Number.isFinite(contentLength) && contentLength > DIRECT_VIDEO_PROBE_RANGE_BYTES) {
      const start = Math.max(0, contentLength - DIRECT_VIDEO_PROBE_RANGE_BYTES);
      const tailChunk = await fetchBufferRange(url, `bytes=${start}-${contentLength - 1}`);

      if (tailChunk) {
        return readMp4DurationFromBuffer(tailChunk);
      }
    }
  } catch {
    return null;
  }

  return null;
}

type RemotePageMetadata = {
  title: string | null;
  description: string | null;
  posterUrl: string | null;
  playableUrl: string | null;
  durationSeconds: number | null;
};

async function fetchRemotePageMetadata(url: URL): Promise<RemotePageMetadata | null> {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent":
            "Mozilla/5.0 (compatible; VideoAnalyzerBot/1.0; +https://example.com)",
        },
      },
      4500,
    );

    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.includes("text/html")) {
      return null;
    }

    const html = await response.text();
    const title =
      matchMetaTag(html, "og:title", "property") ??
      matchMetaTag(html, "twitter:title", "name") ??
      matchTitleTag(html);
    const description =
      matchMetaTag(html, "og:description", "property") ??
      matchMetaTag(html, "description", "name");
    const posterUrl =
      matchMetaTag(html, "og:image", "property") ??
      matchMetaTag(html, "twitter:image", "name");
    const playableUrl =
      matchMetaTag(html, "og:video", "property") ??
      matchMetaTag(html, "og:video:url", "property") ??
      matchMetaTag(html, "twitter:player:stream", "name");
    const durationSeconds =
      normalizeDurationSeconds(
        Number(
          matchMetaTag(html, "video:duration", "property") ??
            matchMetaTag(html, "og:video:duration", "property") ??
            "",
        ),
      ) ?? parseJsonLdDuration(html);

    return {
      title: title ? trimText(normalizeWhitespace(title), 96) : null,
      description: description ? trimText(normalizeWhitespace(description), 220) : null,
      posterUrl: posterUrl ? toAbsoluteUrl(posterUrl, url) : null,
      playableUrl: playableUrl ? toAbsoluteUrl(playableUrl, url) : null,
      durationSeconds,
    };
  } catch {
    return null;
  }
}

export async function extractVideoMetadata(inputUrl: string): Promise<VideoSource> {
  const url = assertValidVideoUrl(inputUrl);
  const provider = detectVideoProvider(url);
  const normalizedUrl = normalizeVideoUrl(url);
  const host = toHostLabel(url.hostname);
  const isDirectVideo = isDirectMediaUrl(url);
  const fallbackTitle = prettifyTitleFromUrl(url, provider);
  const remoteMetadata = isDirectVideo ? null : await fetchRemotePageMetadata(url);
  const derivedPlayableUrl =
    normalizedUrl && isDirectVideo
      ? normalizedUrl
      : remoteMetadata?.playableUrl && isDirectMediaUrl(remoteMetadata.playableUrl)
        ? remoteMetadata.playableUrl
        : null;
  const durationSeconds = isDirectVideo
    ? await probeDirectVideoDuration(url)
    : (remoteMetadata?.durationSeconds ?? null);

  return {
    originalUrl: inputUrl.trim(),
    normalizedUrl,
    host,
    provider,
    title: remoteMetadata?.title ?? fallbackTitle,
    description:
      remoteMetadata?.description ??
      "服务端会基于这条视频链接抽取基础信息、准备转写文本，并生成结构化摘要。",
    posterUrl: remoteMetadata?.posterUrl ?? null,
    playableUrl: derivedPlayableUrl,
    durationSeconds,
  };
}
