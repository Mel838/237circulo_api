import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import {
  AIService,
  ChatMessage,
  ClassificationResult,
  PriceForecastResult,
} from "./ai.service";

// ── Typed request bodies ──────────────────────────────────────────────────────
// We keep these as plain interfaces rather than class-validator DTOs for now
// because the project has not yet installed class-validator.
// Swap to @Body() + class-validator DTO once it is added.

interface ClassifyBody {
  description?: string;
}

interface PriceBody {
  waste_type?: string;
  zone_id?: string;
}

interface ChatBody {
  messages?: ChatMessage[];
  language?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Validate that a request carries the API key defined in INTERNAL_API_KEY.
 * Throws 401 when the header is missing or wrong.
 *
 * This guard is intentionally lightweight — it will be replaced with
 * JwtAuthGuard once AuthModule exports a working JWT strategy.
 */
function assertApiKey(req: Request): void {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) return; // key not configured → open in dev, log a warning

  const provided =
    (req.headers["x-api-key"] as string | undefined) ??
    req.headers.authorization?.replace("Bearer ", "") ??
    "";

  if (provided !== expected) {
    throw new BadRequestException("Unauthorized");
  }
}

/**
 * Narrow an unknown language string to the union accepted by PromptService.
 */
function toLanguage(raw: unknown): "fr" | "en" | "pidgin" {
  if (raw === "en" || raw === "pidgin") return raw;
  return "fr"; // default
}

// ── Controller ────────────────────────────────────────────────────────────────

@Controller("ai")
export class AIController {
  private readonly logger = new Logger(AIController.name);

  constructor(private readonly aiService: AIService) { }

  // ── GET /ai/health ─────────────────────────────────────────────────────────

  /**
   * Simple liveness probe — confirms the AI module is loaded.
   * No auth required.
   */
  @Get("health")
  @HttpCode(HttpStatus.OK)
  health(): { status: string } {
    return { status: "AI module online" };
  }

  // ── POST /ai/classify ──────────────────────────────────────────────────────

  /**
   * Classify waste from an optional image upload and/or a text description.
   *
   * Content-Type: multipart/form-data
   *   - image       (file, optional) — JPEG/PNG, max 5 MB
   *   - description (string, optional) — free-text description
   *
   * At least one of image or description must be present.
   *
   * Returns ClassificationResult as JSON.
   */
  @Post("classify")
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor("image", {
      limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
      fileFilter: (_req, file, cb) => {
        const allowed = ["image/jpeg", "image/png", "image/webp"];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              "Only JPEG, PNG, and WebP images are accepted.",
            ),
            false,
          );
        }
      },
    }),
  )
  async classify(
    @Req() req: Request & { body: ClassifyBody },
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ClassificationResult> {
    assertApiKey(req);

    const description = req.body.description?.trim();
    const imageBase64 = file?.buffer.toString("base64");

    if (!imageBase64 && !description) {
      throw new BadRequestException(
        "Provide at least one of: an image file or a text description.",
      );
    }

    this.logger.log(`classify — image:${!!imageBase64} desc:${!!description}`);

    return this.aiService.classifyWaste(imageBase64, description);
  }

  // ── POST /ai/price ─────────────────────────────────────────────────────────

  /**
   * Forecast a fair FCFA/kg price for a given waste type in a given zone.
   *
   * Body (JSON):
   *   { "waste_type": "plastic", "zone_id": "<uuid>" }
   *
   * Returns PriceForecastResult as JSON.
   */
  @Post("price")
  @HttpCode(HttpStatus.OK)
  async price(
    @Req() req: Request & { body: PriceBody },
  ): Promise<PriceForecastResult> {
    assertApiKey(req);

    const { waste_type, zone_id } = req.body;

    if (!waste_type?.trim()) {
      throw new BadRequestException("waste_type is required.");
    }
    if (!zone_id?.trim()) {
      throw new BadRequestException("zone_id is required.");
    }

    this.logger.log(`price — type:${waste_type} zone:${zone_id}`);

    return this.aiService.forecastPrice(waste_type, zone_id);
  }

  // ── POST /ai/chat ──────────────────────────────────────────────────────────

  /**
   * Streaming chat assistant — responds as Server-Sent Events (SSE).
   *
   * Body (JSON):
   *   {
   *     "messages": [{ "role": "user", "content": "..." }],
   *     "language": "fr" | "en" | "pidgin"   (optional, defaults to "fr")
   *   }
   *
   * The client reads the stream with ReadableStream / EventSource:
   *   data: {"token":"Bon"}
   *   data: {"token":"jour"}
   *   data: [DONE]
   *
   * The connection closes after [DONE].
   */
  @Post("chat")
  async chat(
    @Req() req: Request & { body: ChatBody },
    @Res() res: Response,
  ): Promise<void> {
    assertApiKey(req);

    const { messages, language } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new BadRequestException(
        "messages must be a non-empty array of { role, content } objects.",
      );
    }

    // Validate each message has the correct shape
    for (const msg of messages) {
      if (
        !msg ||
        typeof msg !== "object" ||
        !("role" in msg) ||
        !("content" in msg) ||
        (msg.role !== "user" && msg.role !== "assistant") ||
        typeof msg.content !== "string"
      ) {
        throw new BadRequestException(
          "Each message must have role ('user'|'assistant') and content (string).",
        );
      }
    }

    this.logger.log(`chat — msgs:${messages.length} lang:${language ?? "fr"}`);

    // Set SSE headers before any await so the browser sees them immediately
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering if present
    res.flushHeaders();

    try {
      const stream = await this.aiService.streamChat(
        messages as ChatMessage[],
        toLanguage(language),
      );

      for await (const chunk of stream) {
        const token = chunk.choices[0]?.delta?.content ?? "";
        if (token) {
          // SSE format: "data: <json>\n\n"
          res.write(`data: ${JSON.stringify({ token })}\n\n`);
        }
      }
    } catch (err) {
      this.logger.error(`chat stream error: ${(err as Error).message}`);
      // Send the error as an SSE event so the client can handle it gracefully
      res.write(
        `data: ${JSON.stringify({ error: "AI assistant temporarily unavailable." })}\n\n`,
      );
    } finally {
      res.write("data: [DONE]\n\n");
      res.end();
    }
  }
}
