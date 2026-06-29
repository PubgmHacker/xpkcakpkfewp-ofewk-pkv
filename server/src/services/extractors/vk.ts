type Logger = { info(msg: string, ...args: any[]): void; warn(msg: string, ...args: any[]): void; error(msg: string, ...args: any[]): void };
import { execFile } from "child_process";
import { promisify } from "util";

const exec = promisify(execFile);

// ─────────────────────────────────────────────────────────────────────────────
//  VK Видео экстрактор
//
//  VK Видео (vk.ru/video, vk.com/video) встраивает видео через oEmbed + JSON-LD.
//  yt-dlp поддерживает VK Видео с v3.x — извлекает .mp4 (прогрессивный) или
//  .mpd (DASH). Для expo-av нам нужен прогрессивный .mp4.
// ─────────────────────────────────────────────────────────────────────────────

export interface VKVideoInfo {
  id: string;
  title: string;
  duration: number;
  thumbnailURL?: string;
  streamURL: string;       // прямой .mp4
  quality: string;         // "720p" / "1080p"
  author?: string;
}

export async function extractVKVideo(url: string, ytdlpPath: string, log: Logger): Promise<VKVideoInfo> {
  log.info({ url }, "[VK] Извлечение видео");

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
