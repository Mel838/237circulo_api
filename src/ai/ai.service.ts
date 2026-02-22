import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import OpenAI from 'openai';
import { ChatCompletionChunk } from 'openai/resources/chat/completions';
import { Stream } from 'openai/streaming';
import { DatabaseService } from '../database/database.service';
import { PromptService } from './prompt.service';

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
  confidence: 'high' | 'medium' | 'low';
}

export interface PriceForecastResult {
  price_range_fcfa: PriceRange;
  demand_trend: 'rising' | 'stable' | 'falling';
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ── DB row shapes ──────────────────────────────────────────────────────────────

interface PriceRow extends Record<string, unknown> {
  price_per_kg: string;
}

interface ZoneRow extends Record<string, unknown> {
  name: string;
}

// ── Fallback responses (returned when AI is unavailable) ──────────────────────

const CLASSIFICATION_FALLBACK: ClassificationResult = {
  category: 'other',
  sub_category: 'unidentified',
  recyclability_score: 0,
  price_range_fcfa: { min: 0, max: 0 },
  guidance: 'AI classification unavailable. Please select a category manually.',
  confidence: 'low',
};

const PRICE_FALLBACK: PriceForecastResult = {
  price_range_fcfa: { min: 0, max: 0 },
  demand_trend: 'stable',
  confidence: 'low',
  rationale: 'Price oracle temporarily unavailable. Use recent market rates.',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Safely parse a JSON string returned by GPT.
 * Strips markdown code fences if present, then parses.
 * Returns null on failure instead of throwing.
 */
function safeJsonParse<T>(raw: string): T | null {
  try {
    // Strip ```json ... ``` or ``` ... ``` fences GPT occasionally adds
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '')
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

/**
 * Validate that a ClassificationResult has the minimum required fields.
 */
function isValidClassification(obj: unknown): obj is ClassificationResult {
  if (!obj || typeof obj !== 'object') return false;
  const c = obj as Record<string, unknown>;
  return (
    typeof c['category'] === 'string' &&
    typeof c['recyclability_score'] === 'number' &&
    typeof c['price_range_fcfa'] === 'object' &&
    c['price_range_fcfa'] !== null
  );
}

/**
 * Validate that a PriceForecastResult has the minimum required fields.
 */
function isValidForecast(obj: unknown): obj is PriceForecastResult {
  if (!obj || typeof obj !== 'object') return false;
  const f = obj as Record<string, unknown>;
  return (
    typeof f['price_range_fcfa'] === 'object' &&
    f['price_range_fcfa'] !== null &&
    typeof f['demand_trend'] === 'string'
  );
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
    const apiKey = process.env.OPENAI_API_KEY ?? '';

    if (!apiKey || apiKey === 'sk-proj-your-new-key-here') {
      this.logger.warn(
        'OPENAI_API_KEY is not set or is a placeholder. AI features will return fallback responses.',
      );
    }

    this.client = new OpenAI({ apiKey });
  }

  // ── 1. Waste Classification ──────────────────────────────────────────────

  /**
   * Classify waste from a base64-encoded image, a text description, or both.
   * Falls back gracefully when the API key is missing or the call fails.
   */
  async classifyWaste(
    imageBase64?: string,
    description?: string,
  ): Promise<ClassificationResult> {
    const userContent: OpenAI.Chat.ChatCompletionContentPart[] = [];

    if (imageBase64) {
      userContent.push({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${imageBase64}`,
          detail: 'low',
        },
      });
    }

    userContent.push({
      type: 'text',
      text: description
        ? `Classify this waste: ${description}`
        : 'Classify the waste shown in the image.',
    });

    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 400,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: this.prompts.classificationSystem() },
          {
            role: 'user',
            content:
              userContent.length === 1 && !imageBase64
                ? (userContent[0] as OpenAI.Chat.ChatCompletionContentPartText).text
                : userContent,
          },
        ],
      });

      const raw = response.choices[0]?.message?.content ?? '{}';
      const parsed = safeJsonParse<ClassificationResult>(raw);

      if (!parsed || !isValidClassification(parsed)) {
        this.logger.warn(
          `classifyWaste — GPT returned unparseable JSON, using fallback. Raw: ${raw.slice(0, 200)}`,
        );
        return CLASSIFICATION_FALLBACK;
      }

      return parsed;
    } catch (err) {
      this.logger.error(
        `classifyWaste failed: ${(err as Error).message}`,
        (err as Error).stack,
      );

      // Return fallback instead of throwing so listing creation still works
      return CLASSIFICATION_FALLBACK;
    }
  }

  // ── 2. Price Oracle ──────────────────────────────────────────────────────

  /**
   * Forecast a fair FCFA/kg price for a waste type in a given zone.
   * Pulls the last 30 days of transaction prices from DB to ground the estimate.
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

    const recentPrices = priceRes.rows
      .map((r) => Number.parseFloat(r.price_per_kg))
      .filter((n) => !Number.isNaN(n));

    // Get zone name for the prompt
    const zoneRes = await this.db.query<ZoneRow>(
      'SELECT name FROM zones WHERE id = $1',
      [zoneId],
    );
    const zoneName = zoneRes.rows[0]?.name ?? zoneId;

    try {
      const response = await this.client.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 300,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: this.prompts.priceOracleSystem() },
          {
            role: 'user',
            content: this.prompts.priceOracleUser(wasteType, zoneName, recentPrices),
          },
        ],
      });

      const raw = response.choices[0]?.message?.content ?? '{}';
      const parsed = safeJsonParse<PriceForecastResult>(raw);

      if (!parsed || !isValidForecast(parsed)) {
        this.logger.warn(
          `forecastPrice — GPT returned unparseable JSON, using fallback. Raw: ${raw.slice(0, 200)}`,
        );
        return PRICE_FALLBACK;
      }

      return parsed;
    } catch (err) {
      this.logger.error(
        `forecastPrice failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      return PRICE_FALLBACK;
    }
  }

  // ── 3. Streaming Chat ────────────────────────────────────────────────────

  /**
   * Returns an OpenAI streaming iterator.
   * The controller pipes this directly to the HTTP response as SSE.
   * Throws ServiceUnavailableException on failure (streaming cannot fallback silently).
   */
  async streamChat(
    messages: ChatMessage[],
    language: 'fr' | 'en' | 'pidgin',
  ): Promise<Stream<ChatCompletionChunk>> {
    try {
      return await this.client.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 600,
        temperature: 0.7,
        stream: true,
        messages: [
          { role: 'system', content: this.prompts.chatSystem(language) },
          ...messages,
        ],
      });
    } catch (err) {
      this.logger.error(
        `streamChat failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw new ServiceUnavailableException(
        'AI chat is temporarily unavailable. Please try again later.',
      );
    }
  }
}