import type { VideoSource } from "@/lib/analysis/types";
import {
  assertValidVideoUrl,
  decodeHtmlEntities,
  detectVideoProvider,
  fetchWithTimeout,
  isDirectMediaUrl,
  normalizeVideoUrl,
  normalizeWhitespace,
  prettifyTitleFromUrl,
  toAbsoluteUrl,
  toHostLabel,
  trimText,
} from "@/lib/analysis/utils";

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

async function fetchRemotePageMetadata(url: URL) {
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

    return {
      title: title ? trimText(normalizeWhitespace(title), 96) : null,
      description: description ? trimText(normalizeWhitespace(description), 220) : null,
      posterUrl: posterUrl ? toAbsoluteUrl(posterUrl, url) : null,
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
  const playableUrl = isDirectMediaUrl(url) ? normalizedUrl : null;
  const fallbackTitle = prettifyTitleFromUrl(url, provider);
  const remoteMetadata = playableUrl ? null : await fetchRemotePageMetadata(url);

  return {
    originalUrl: inputUrl.trim(),
    normalizedUrl,
    host,
    provider,
    title: remoteMetadata?.title ?? fallbackTitle,
    description:
      remoteMetadata?.description ??
      "服务端会基于这条视频链接抽取基础信息、准备转写文本，并生成结构化概要。",
    posterUrl: remoteMetadata?.posterUrl ?? null,
    playableUrl,
  };
}
