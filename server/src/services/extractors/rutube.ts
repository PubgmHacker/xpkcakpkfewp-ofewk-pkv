import type { FastifyBaseLogger } from "fastify";
import { execFile } from "child_process";
import { promisify } from "util";

const exec = promisify(execFile);

// ─────────────────────────────────────────────────────────────────────────────
//  RuTube extractor — yt-dlp based
// ─────────────────────────────────────────────────────────────────────────────

export interface RuTubeInfo {
  id: string;
  title: string;
  duration: number;
  thumbnailURL?: string;
  streamURL: string;
  format: "m3u8" | "mp4";
  quality: string;
  author?: string;
}

export async function extractRuTube(url: string, ytdlpPath: string, log: FastifyBaseLogger): Promise<RuTubeInfo> {
  log.info({ url }, "[RuTube] Extracting video");

  const { stdout } = await exec(ytdlpPath, [
    "--dump-json",
    "--no-download",
    "--no-playlist",
    url,
  ], { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 });

  const info = JSON.parse(stdout);

  // Приоритет: HLS (m3u8) → прогрессивный mp4.
  const formats = info.formats || [];
  const hls = formats.find((f: any) =>
    f.protocol === "m3u8_native" || f.ext === "m3u8" || f.format_id?.includes("hls")
  );
  const mp4 = formats.find((f: any) =>
    f.ext === "mp4" && f.vcodec !== "none" && f.acodec !== "none" && f.url
  );

  const chosen = hls || mp4 || info;
  if (!chosen?.url) {
    throw new Error("RuTube: не удалось извлечь поток");
  }

  const format: "m3u8" | "mp4" = chosen.ext === "m3u8" || chosen.protocol?.includes("m3u8")
    ? "m3u8"
    : "mp4";

  return {
    id: info.id,
    title: info.title,
    duration: info.duration,
    thumbnailURL: info.thumbnail,
    streamURL: chosen.url,
    format,
    quality: chosen.height ? `${chosen.height}p` : "adaptive",
    author: info.uploader,
  };
}

export function isRuTubeURL(url: string): boolean {
  return /rutube\.ru\/video/i.test(url);
}
