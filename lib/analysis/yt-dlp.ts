import { spawn } from "node:child_process";

import { normalizeDurationSeconds, normalizeWhitespace, trimText } from "@/lib/analysis/utils";

type YtDlpProbeResult = {
  title: string | null;
  description: string | null;
  posterUrl: string | null;
  durationSeconds: number | null;
};

function getCookieArgs() {
  const args: string[] = [];
  const cookiesPath = process.env.YTDLP_COOKIES_PATH?.trim();
  if (cookiesPath) {
    args.push("--cookies", cookiesPath);
  }

  const cookiesFromBrowser = process.env.YTDLP_COOKIES_FROM_BROWSER?.trim();
  if (cookiesFromBrowser) {
    args.push("--cookies-from-browser", cookiesFromBrowser);
  }

  return args;
}

export function getYtDlpBinary() {
  const explicit = process.env.YT_DLP_BIN?.trim();
  if (explicit) {
    return explicit;
  }

  if (process.env.VERCEL === "1") {
    return "bin/yt-dlp";
  }

  if (process.platform === "win32") {
    return ".tools/yt-dlp.exe";
  }

  return "yt-dlp";
}

function normalizeOptionalText(value: unknown, maxLength: number) {
  return typeof value === "string" && normalizeWhitespace(value)
    ? trimText(normalizeWhitespace(value), maxLength)
    : null;
}

export async function probeVideoMetadataWithYtDlp(
  videoUrl: string,
): Promise<YtDlpProbeResult | null> {
  const command = getYtDlpBinary();
  const args = [
    "--no-playlist",
    "--skip-download",
    "--dump-single-json",
    ...getCookieArgs(),
    videoUrl,
  ];

  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });

      let output = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve(output);
          return;
        }

        reject(new Error(normalizeWhitespace(stderr) || `yt-dlp exited with code ${code}`));
      });
    });

    const payload = JSON.parse(stdout) as Record<string, unknown>;

    return {
      title:
        normalizeOptionalText(payload.fulltitle, 96) ??
        normalizeOptionalText(payload.title, 96),
      description: normalizeOptionalText(payload.description, 220),
      posterUrl:
        typeof payload.thumbnail === "string" && payload.thumbnail.trim()
          ? payload.thumbnail.trim()
          : null,
      durationSeconds: normalizeDurationSeconds(
        typeof payload.duration === "number" ? payload.duration : Number(payload.duration ?? ""),
      ),
    };
  } catch {
    return null;
  }
}
