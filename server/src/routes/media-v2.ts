import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { MediaExtractor } from "../services/mediaExtractor.js";

// ─────────────────────────────────────────────────────────────────────────────
//  media-v2.ts — REST маршруты для медиа-экстрактора
//
//    POST /api/media/extract   — извлечь прямой поток / определить WebView-режим
//    GET  /api/media/sources   — список поддерживаемых источников
//    POST /api/media/probe     — проверить доступность URL без извлечения
// ─────────────────────────────────────────────────────────────────────────────

const extractSchema = z.object({
  url: z.string().url("Некорректный URL"),
});

export async function mediaRoutesV2(fastify: FastifyInstance) {
  const extractor = new MediaExtractor(fastify.log, fastify.config.ytdlpPath);

  // ─── POST /extract ───────────────────────────────────────────────────────
  fastify.post(
    "/extract",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { url } = extractSchema.parse(request.body);

      try {
        const media = await extractor.extract(url);
        return reply.send(media);
      } catch (e: any) {
        request.log.error({ err: e.message, url }, "[media/extract] failed");
        return reply.status(422).send({
          error: e.message || "Не удалось извлечь медиа",
        });
      }
    }
  );

  // ─── GET /sources ────────────────────────────────────────────────────────
  fastify.get(
    "/sources",
    { preHandler: [fastify.authenticate] },
    async (_request, reply) => {
      return reply.send({ sources: extractor.listSources() });
    }
  );

  // ─── POST /probe — лёгкая проверка без извлечения ────────────────────────
  fastify.post(
    "/probe",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { url } = extractSchema.parse(request.body);
      const source = extractor.detectSource(url);
      return reply.send({
        supported: true,
        sourceID: source.id,
        sourceName: source.name,
        mode: source.mode,
        requiresSubscription: source.requiresSubscription,
        message:
          source.mode === "webview"
            ? `${source.name}: режим WebView-синхронизации. Каждый зритель должен иметь свою подписку.`
            : `${source.name}: доступен прямой поток для нативного плеера.`,
      });
    }
  );
}
