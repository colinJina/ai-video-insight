import { createWriteStream } from "node:fs";
import { chmod, mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const targetPath = join(process.cwd(), "bin", "yt-dlp");
const tempPath = `${targetPath}.download`;
const downloadUrl =
  process.env.YT_DLP_DOWNLOAD_URL?.trim() ||
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux";
const shouldInstall =
  process.platform === "linux" &&
  (process.env.VERCEL === "1" || process.env.INSTALL_YT_DLP === "1");

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!shouldInstall) {
    console.log("[install-yt-dlp] Skipped for this environment.");
    return;
  }

  if (await fileExists(targetPath)) {
    console.log(`[install-yt-dlp] Already present at ${targetPath}`);
    return;
  }

  await mkdir(dirname(targetPath), { recursive: true });

  const response = await fetch(downloadUrl, {
    redirect: "follow",
    headers: {
      "User-Agent": "my-app/yt-dlp-installer",
    },
  });

  if (!response.ok || !response.body) {
    throw new Error(
      `[install-yt-dlp] Download failed with status ${response.status} from ${downloadUrl}`,
    );
  }

  try {
    await pipeline(
      Readable.fromWeb(response.body),
      createWriteStream(tempPath),
    );
    await chmod(tempPath, 0o755);
    await rename(tempPath, targetPath);
    console.log(`[install-yt-dlp] Installed to ${targetPath}`);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
