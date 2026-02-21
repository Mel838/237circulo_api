import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import OpenAI from "openai";
import type { ChatCompletionChunk } from "openai/resources/chat/completions";
import type { Stream } from "openai/streaming";
import type { DatabaseService } from "../database/database.service";
import type { PromptService } from "./prompt.service";

// ── Response shapes ────────────────────────────────────────────────────────────

export interface PriceRange {
  min: number;
  max: number;
}

export interface ClassificationResult {
  category: string;
  sub_category: string;
  recyclability_score: number;
  price_range_fcfa: PriceRange;
  guidance: string;
  confidence: "high" | "medium" | "low";
}

export interface PriceForecastResult {
  price_range_fcfa: PriceRange;
  demand_trend: "rising" | "stable" | "falling";
  confidence: "high" | "medium" | "low";
  rationale: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ── DB row shapes (must satisfy Record<string, unknown>) ──────────────────────

interface PriceRow extends Record<string, unknown> {
  price_per_kg: string;
}

interface ZoneRow extends Record<string, unknown> {
  name: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);
  private readonly client: OpenAI;

  constructor(
    private readonly db: DatabaseService,
    private readonly prompts: PromptService,
  ) {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? "",
    });
  }

  // ── 1. Waste Classification ──────────────────────────────────────────────

  /**
   * Classify waste from a base64-encoded JPEG image, a text description,
   * or both. At least one must be provided (validated in the controller).
   *
   * Uses GPT-4o with response_format: json_object so the response is
   * always valid JSON — no markdown fence stripping needed.
   */
  async classifyWaste(
    imageBase64?: string,
    description?: string,
  ): Promise<ClassificationResult> {
    // Build the user content array
    // Text-only path avoids the vision model cost when no image is provided
    const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [];

    if (imageBase64) {
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${imageBase64}`,
          detail: "low", // "low" is cheaper and sufficient for waste identification
        },
      });
    }

    userContent.push({
      type: "text",
      text: description
        ? `Classify this waste: ${description}`
        : "Classify the waste shown in the image.",
    });

    try {
      const response = await this.client.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 400,
        temperature: 0.1, // low temperature = consistent, deterministic output
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: this.prompts.classificationSystem(),
          },
          {
            role: "user",
            // If there is no image, send a plain string (cheaper, no vision)
            content:
              userContent.length === 1 && !imageBase64
                ? (userContent[0] as OpenAI.Chat.ChatCompletionContentPartText)
                    .text
                : userContent,
          },
        ],
      });

      const raw = response.choices[0]?.message?.content ?? "{}";
      return JSON.parse(raw) as ClassificationResult;
    } catch (err) {
      this.logger.error(
        `classifyWaste failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw new ServiceUnavailableException(
        "AI classification is temporarily unavailable. Please select a category manually.",
      );
    }
  }

  // ── 2. Price Oracle ──────────────────────────────────────────────────────

  /**
   * Fetch the last 30 days of FCFA/kg prices for a given waste type
   * in a given zone from the transactions table, then ask GPT to
   * forecast a fair current price range.
   *
   * @param wasteType  e.g. "plastic"
   * @param zoneId     UUID of the zone
   */
  async forecastPrice(
    wasteType: string,
    zoneId: string,
  ): Promise<PriceForecastResult> {
    // Pull recent prices from DB
    const priceRes = await this.db.query<PriceRow>(
      `SELECT
         ROUND(
           (t.price_paid / NULLIF(t.weight_verified, 0))::numeric,
           2
         )::text AS price_per_kg
       FROM   transactions t
       JOIN   waste_listings wl ON wl.id = t.listing_id
       WHERE  wl.waste_type  = $1
         AND  wl.zone_id     = $2
         AND  t.completed_at > NOW() - INTERVAL '30 days'
       ORDER  BY t.completed_at DESC
       LIMIT  20`,
      [wasteType, zoneId],
    );

    const recentPrices = priceRes.rows.map((r) =>
      Number.parseFloat(r.price_per_kg),
    );

    // Get the human-readable zone name for the prompt
    const zoneRes = await this.db.query<ZoneRow>(
      "SELECT name FROM zones WHERE id = $1",
      [zoneId],
    );
    const zoneName = zoneRes.rows[0]?.name ?? zoneId;

    try {
      const response = await this.client.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 300,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: this.prompts.priceOracleSystem(),
          },
          {
            role: "user",
            content: this.prompts.priceOracleUser(
              wasteType,
              zoneName,
              recentPrices,
            ),
          },
        ],
      });

      const raw = response.choices[0]?.message?.content ?? "{}";
      return JSON.parse(raw) as PriceForecastResult;
    } catch (err) {
      this.logger.error(
        `forecastPrice failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw new ServiceUnavailableException(
        "Price oracle is temporarily unavailable.",
      );
    }
  }

  // ── 3. Streaming Chat ────────────────────────────────────────────────────

  /**
   * Returns an OpenAI streaming iterator.
   * The controller pipes this directly to the HTTP response as SSE.
   *
   * @param messages  Full conversation history (role + content pairs)
   * @param language  User's preferred language from their profile
   */
  async streamChat(
    messages: ChatMessage[],
    language: "fr" | "en" | "pidgin",
  ): Promise<Stream<ChatCompletionChunk>> {
    return this.client.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 600,
      temperature: 0.7,
      stream: true,
      messages: [
        {
          role: "system",
          content: this.prompts.chatSystem(language),
        },
        ...messages,
      ],
    });
  }
}
