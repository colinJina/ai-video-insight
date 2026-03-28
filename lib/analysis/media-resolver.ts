import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { spawn } from "node:child_process";

import { ExternalServiceError } from "@/lib/analysis/errors";
import type { VideoSource } from "@/lib/analysis/types";
import { fetchWithTimeout, isDirectMediaUrl, normalizeWhitespace } from "@/lib/analysis/utils";

const DEFAULT_UPLOAD_TIMEOUT_MS = Number(
  process.env.TRANSCRIPT_UPLOAD_TIMEOUT_MS ?? 5 * 60 * 1000,
);

function getTranscriptTempRoot() {
  if (process.env.VERCEL === "1") {
    return "/tmp/transcript-media";
  }

  return ".tmp/transcript-media";
}

type PreparedTranscriptMedia = {
  audioUrl: string;
  cleanup: () => Promise<void>;
};

function getDefaultYtDlpBinary() {
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

function noopCleanup() {
  return Promise.resolve();
}

function formatCommand(command: string, args: string[]) {
  return [command, ...args].join(" ");
}

function getYtDlpArgs(videoUrl: string, outputTemplate: string) {
  const args = [
    "--no-playlist",
    "--restrict-filenames",
    "--format",
    "bestaudio/best",
    "--output",
    outputTemplate,
  ];

  const cookiesPath = process.env.YTDLP_COOKIES_PATH?.trim();
  if (cookiesPath) {
    args.push("--cookies", cookiesPath);
  }

  const cookiesFromBrowser = process.env.YTDLP_COOKIES_FROM_BROWSER?.trim();
  if (cookiesFromBrowser) {
    args.push("--cookies-from-browser", cookiesFromBrowser);
  }

  args.push(videoUrl);
  return args;
}

async function runYtDlp(video: VideoSource) {
  const transcriptTempRoot = getTranscriptTempRoot();
  await mkdir(transcriptTempRoot, { recursive: true });
  const workingDirectory = await mkdtemp(
    join(transcriptTempRoot, "video-analyzer-"),
  );
  const outputTemplate = join(workingDirectory, "source.%(ext)s");
  const command = getDefaultYtDlpBinary();
  const args = getYtDlpArgs(video.normalizedUrl, outputTemplate);

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });

      let stderr = "";

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        if ("code" in error && error.code === "ENOENT") {
          reject(
            new ExternalServiceError(
              `当前链接需要先解析媒体流，但服务端未找到 yt-dlp。请安装 yt-dlp，或通过 YT_DLP_BIN 指向其可执行文件。`,
              true,
            ),
          );
          return;
        }

        reject(error);
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(
          new ExternalServiceError(
            `媒体下载失败。命令: ${formatCommand(command, args)}。${normalizeWhitespace(stderr) || "下载器未返回更多信息。"}`,
            true,
          ),
        );
      });
    });

    const entries = await readdir(workingDirectory, { withFileTypes: true });
    const file = entries.find((entry) => entry.isFile());

    if (!file) {
      throw new ExternalServiceError("媒体下载完成，但没有找到可上传的音频文件。", true);
    }

    return {
      filePath: join(workingDirectory, file.name),
      cleanup: () => rm(workingDirectory, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(workingDirectory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }
}

type UploadFileInput = {
  filePath: string;
  contentType?: string;
};

type UploadFile = (input: UploadFileInput) => Promise<string>;

function inferContentType(filePath: string) {
  const extension = extname(filePath).toLowerCase();

  switch (extension) {
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
    case ".mp4":
      return "audio/mp4";
    case ".webm":
      return "audio/webm";
    case ".wav":
      return "audio/wav";
    case ".ogg":
    case ".opus":
      return "audio/ogg";
    case ".aac":
      return "audio/aac";
    case ".flac":
      return "audio/flac";
    default:
      return "application/octet-stream";
  }
}

export async function uploadFileToUrl(
  endpoint: string,
  apiKey: string,
  input: UploadFileInput,
  timeoutMs = DEFAULT_UPLOAD_TIMEOUT_MS,
) {
  const fileStats = await stat(input.filePath);
  const stream = createReadStream(input.filePath);
  const requestInit: RequestInit & { duplex: "half" } = {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": input.contentType ?? "application/octet-stream",
      "Content-Length": String(fileStats.size),
    },
    body: stream as unknown as BodyInit,
    duplex: "half",
  };

  const response = await fetchWithTimeout(
    endpoint,
    requestInit,
    timeoutMs,
  );

  const rawBody = await response.text();
  let body: unknown = null;

  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    throw new ExternalServiceError("上传媒体文件时，转写服务返回了无法解析的响应。");
  }

  if (!response.ok) {
    const message =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : `上传媒体文件失败，状态码 ${response.status}。`;

    throw new ExternalServiceError(message, true);
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("upload_url" in body) ||
    typeof body.upload_url !== "string" ||
    !body.upload_url
  ) {
    throw new ExternalServiceError("上传媒体文件后，转写服务没有返回有效的 upload_url。");
  }

  return body.upload_url;
}

export async function prepareTranscriptMedia(
  video: VideoSource,
  uploadFile: UploadFile,
): Promise<PreparedTranscriptMedia> {
  const directUrl = video.playableUrl ?? video.normalizedUrl;
  if (isDirectMediaUrl(directUrl)) {
    return {
      audioUrl: directUrl,
      cleanup: noopCleanup,
    };
  }

  const downloaded = await runYtDlp(video);

  try {
    const uploadedUrl = await uploadFile({
      filePath: downloaded.filePath,
      contentType: inferContentType(downloaded.filePath),
    });

    return {
      audioUrl: uploadedUrl,
      cleanup: downloaded.cleanup,
    };
  } catch (error) {
    await downloaded.cleanup().catch(() => undefined);
    throw error;
  }
}
