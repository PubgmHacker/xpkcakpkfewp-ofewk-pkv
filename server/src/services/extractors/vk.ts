import type { FastifyBaseLogger } from "fastify";
import { execFile } from "child_process";
import { promisify } from "util";

const exec = promisify(execFile);

// ─────────────────────────────────────────────────────────────────────────────
//  VK extractor — yt-dlp based
// ─────────────────────────────────────────────────────────────────────────────

export interface VKVideoInfo {
  id: string;
  title: string;
  duration: number;
  thumbnailURL?: string;
  streamURL: string;
  quality: string;
  author?: string;
}

export async function extractVKVideo(url: string, ytdlpPath: string, log: FastifyBaseLogger): Promise<VKVideoInfo> {
  log.info({ url }, "[VK] Extracting video");

  const { stdout } = await exec(ytdlpPath, [
    "--dump-json",
    "--no-download",
    "--no-playlist",
    url,
  ], { timeout: 30_000, maxBuffer: 10 * 1024 * 1024 });

  const info = JSON.parse(stdout);

  // VK отдаёт несколько прогрессивных форматов (240p/360p/480p/720p).
  // Выбираем лучший mp4 с видео+аудио.
  const formats = (info.formats || []).filter((f: any) =>
    f.ext === "mp4" &&
    f.vcodec !== "none" &&
    f.acodec !== "none" &&
    f.url
  );

  if (formats.length === 0) {
    throw new Error("VK: не найден прогрессивный .mp4 формат (возможно, только DASH)");
  }

  // Сортировка по высоте (предпочитаем 720p)
  formats.sort((a: any, b: any) => (b.height || 0) - (a.height || 0));
  const best = formats[0];

  return {
    id: info.id,
    title: info.title,
    duration: info.duration,
    thumbnailURL: info.thumbnail,
    streamURL: best.url,
    quality: best.height ? `${best.height}p` : "unknown",
    author: info.uploader,
  };
}

export function isVKVideoURL(url: string): boolean {
  return /vk\.com\/video|vk\.ru\/video|vkvideo\.ru/i.test(url);
}
