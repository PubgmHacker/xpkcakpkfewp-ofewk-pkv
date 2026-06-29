import type { FastifyInstance } from "fastify";
import { z } from "zod";

// ─── YouTube Extractor Route ──────────────────────────
// This route will be handled by the YouTubeService
// Registered as a separate route file for clarity

const extractSchema = z.object({
  url: z.string().url().refine(
    (val) => {
      const patterns = [
        /youtube\.com\/watch\?v=/,
        /youtu\.be\//,
        /youtube\.com\/shorts\//,
        /youtube\.com\/embed\//,
      ];
      return patterns.some((p) => p.test(val));
    },
    { message: "Must be a valid YouTube URL" }
  ),
});

export async function mediaRoutes(fastify: FastifyInstance) {
  // POST /api/media/extract — extract direct stream URL from YouTube
  fastify.post(
    "/extract",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const body = extractSchema.parse(request.body);

      try {
        const result = await fastify.youtubeService.extract(body.url);
        return reply.send(result);
      } catch (err) {
        fastify.log.error(err, "YouTube extraction failed");
        return reply.status(422).send({
          error: "Failed to extract video. The video may be unavailable or restricted.",
        });
      }
    }
  );

  // POST /api/media/extract/validate — validate a URL before full extraction
  fastify.post(
    "/extract/validate",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const schema = z.object({ url: z.string().url() });
      const body = schema.parse(request.body);

      const supportedPatterns: Record<string, string> = {
        "youtube.com": "youtube",
        "youtu.be": "youtube",
        "vimeo.com": "vimeo",
        "plex": "plex",
      };

      let type: string | null = null;
      for (const [domain, mediaType] of Object.entries(supportedPatterns)) {
        if (body.url.includes(domain)) {
          type = mediaType;
          break;
        }
      }

      // Direct URL (mp4, m3u8, mp3)
      if (!type && /\.(mp4|m3u8|mp3|webm|mkv)(\?|$)/i.test(body.url)) {
        type = "direct";
      }

      return reply.send({
        supported: type !== null,
        type: type ?? "unknown",
        message: type
          ? `Supported: ${type}`
          : "Unsupported URL format. Try YouTube, Vimeo, direct MP4/M3U8, or Plex.",
      });
    }
  );
}
