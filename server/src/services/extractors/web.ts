import type { FastifyBaseLogger } from "fastify";

// ─────────────────────────────────────────────────────────────────────────────
//  Web extractor (direct URLs + HTML video tag parsing)
// ─────────────────────────────────────────────────────────────────────────────

export interface WebVideoInfo {
  id: string;
  title: string;
  streamURL: string;
  format: string;
  contentType?: string;
  duration?: number;
}

const VIDEO_EXTENSIONS = [".mp4", ".m3u8", ".webm", ".mov", ".mkv", ".mp3", ".aac"];

/** Это прямая ссылка на видеофайл? */
export function isDirectMediaURL(url: string): boolean {
  const lower = url.toLowerCase().split("?")[0];
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/** Извлечь прямой поток из URL. */
export async function extractWebMedia(
  url: string,
  log: FastifyBaseLogger
): Promise<WebVideoInfo> {
  log.info({ url }, "[Web] Extracting media");

  // Сценарий 1: прямая ссылка на файл
  if (isDirectMediaURL(url)) {
    const ok = await validateURL(url, log);
    if (!ok) throw new Error("Прямая ссылка недоступна (404/CORS)");

    const ext = url.toLowerCase().split("?")[0].split(".").pop() || "mp4";
    return {
      id: `web_${Buffer.from(url).toString("base64").slice(0, 12)}`,
      title: extractFilename(url),
      streamURL: url,
      format: ext,
      contentType: guessContentType(ext),
    };
  }

  // Сценарий 2: HTML-страница → парсинг <video> тегов
  const html = await fetchHTML(url, log);
  const videoSrc = extractVideoTagFromHTML(html, url);
  if (!videoSrc) {
    throw new Error("На странице не найден <video> тег. Возможно, контент защищён DRM.");
  }

  return {
    id: `web_${Buffer.from(url).toString("base64").slice(0, 12)}`,
    title: extractTitleFromHTML(html) || extractFilename(url),
    streamURL: videoSrc,
    format: videoSrc.toLowerCase().endsWith(".m3u8") ? "m3u8" : "mp4",
  };
}

// ─── Вспомогательные функции ───────────────────────────────────────────────

async function validateURL(url: string, log: FastifyBaseLogger): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(10_000) });
    return res.ok;
  } catch (e: any) {
    log.warn({ url, err: e.message }, "[Web] HEAD check failed, trying GET");
    // Некоторые серверы не поддерживают HEAD — пробуем GET с range
    try {
      const res = await fetch(url, {
        headers: { Range: "bytes=0-0" },
        signal: AbortSignal.timeout(10_000),
      });
      return res.ok || res.status === 206;
    } catch {
      return false;
    }
  }
}

async function fetchHTML(url: string, log: FastifyBaseLogger): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Не удалось загрузить страницу (${res.status})`);
  return res.text();
}

function extractVideoTagFromHTML(html: string, baseUrl: string): string | null {
  // <video><source src="..."></video>
  const sourceMatch = html.match(/<source[^>]+src=["']([^"']+)["']/i);
  if (sourceMatch) return resolveURL(sourceMatch[1], baseUrl);

  // <video src="...">
  const videoMatch = html.match(/<video[^>]+src=["']([^"']+)["']/i);
  if (videoMatch) return resolveURL(videoMatch[1], baseUrl);

  // JSON-LD contentUrl
  const jsonLdMatch = html.match(/"contentUrl"\s*:\s*"([^"]+)"/);
  if (jsonLdMatch) return resolveURL(jsonLdMatch[1], baseUrl);

  return null;
}

function resolveURL(src: string, baseUrl: string): string {
  try {
    return new URL(src, baseUrl).href;
  } catch {
    return src;
  }
}

function extractFilename(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || u.hostname);
  } catch {
    return "Веб-видео";
  }
}

function extractTitleFromHTML(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : null;
}

function guessContentType(ext: string): string {
  const map: Record<string, string> = {
    mp4: "video/mp4",
    m3u8: "application/vnd.apple.mpegurl",
    webm: "video/webm",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    mp3: "audio/mpeg",
    aac: "audio/aac",
  };
  return map[ext] || "application/octet-stream";
}
