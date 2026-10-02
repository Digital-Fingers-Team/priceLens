import { BadRequestException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../common/errors/app.exception';
import { RedisCacheService } from '../common/cache/redis-cache.service';
import { LlmService } from '../llm/llm.service';

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface UploadedImage {
  buffer: Buffer;
  mimetype: string;
  size: number;
}

export interface Recognition {
  found: boolean;
  brand: string | null;
  model: string | null;
  productType: string | null;
  /** What to search the catalogue for: brand, model and the one spec that tells variants apart. */
  query: string | null;
  confidence: number;
}

const PROMPT = `You identify consumer products for a price-comparison site in Egypt.
The image is a photo of a product, or a screenshot (a store page, an Instagram or Facebook post, a chat).
Read any visible text, including Arabic. Identify the single main product being sold or shown.
Return JSON exactly like:
{"found": true, "brand": "Samsung", "model": "Galaxy S24 Ultra", "productType": "smartphone", "query": "Samsung Galaxy S24 Ultra 256GB", "confidence": 0.9}
Rules: "query" is in English, at most 8 words, brand + model + at most one distinguishing spec (storage, size).
If you cannot tell what the product is, return {"found": false, "brand": null, "model": null, "productType": null, "query": null, "confidence": 0}.
Never guess a model that is not visible or recognisable; lower the confidence instead.`;

export function validateRecognition(value: unknown): Recognition | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const text = (x: unknown, max: number) => (typeof x === 'string' && x.trim() ? x.trim().slice(0, max) : null);
  const confidence = typeof v.confidence === 'number' && Number.isFinite(v.confidence) ? Math.min(1, Math.max(0, v.confidence)) : 0;
  const query = text(v.query, 120);
  const found = v.found === true && query !== null && confidence >= 0.35;
  return {
    found,
    brand: text(v.brand, 64),
    model: text(v.model, 96),
    productType: text(v.productType, 64),
    query: found ? query : null,
    confidence,
  };
}

/**
 * Photo or screenshot in, a catalogue search out. The model only reads the
 * image; the prices come from the normal search, never from the model.
 * Metered per user per day (IMAGE_SEARCH_DAILY_LIMIT).
 */
@Injectable()
export class ImageSearchService {
  private readonly logger = new Logger(ImageSearchService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly cache: RedisCacheService,
    private readonly config: ConfigService,
  ) {}

  async recognise(userId: string, image: UploadedImage | undefined): Promise<Recognition & { remainingToday: number }> {
    if (!image?.buffer?.length) throw new BadRequestException('Attach a photo or a screenshot');
    if (!IMAGE_TYPES.includes(image.mimetype)) throw new BadRequestException('Use a JPEG, PNG or WebP image');
    if (image.size > MAX_IMAGE_BYTES) throw new BadRequestException('The image is larger than 5 MB');
    if (!this.llm.isAvailable()) throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE', 'Image search is not available right now');

    const remainingToday = await this.spend(userId);
    const answer = await this.llm.json(
      { prompt: PROMPT, images: [{ mimeType: image.mimetype, data: image.buffer.toString('base64') }], maxTokens: 512 },
      validateRecognition,
    );
    if (!answer) {
      throw new AppException(HttpStatus.SERVICE_UNAVAILABLE, 'SERVICE_UNAVAILABLE', 'We could not read the image right now. Try again in a minute.');
    }
    this.logger.log(`Image search by ${userId} via ${answer.provider}: ${answer.value.found ? answer.value.query : 'not recognised'}`);
    return { ...answer.value, remainingToday };
  }

  /** One use of today's allowance, counted in Redis; refused past the limit. */
  private async spend(userId: string): Promise<number> {
    const limit = this.config.get<number>('llm.imageSearchDailyLimit', 30);
    const key = `image-search:${userId}:${new Date().toISOString().slice(0, 10)}`;
    const used = await this.cache.client.incr(key);
    if (used === 1) await this.cache.client.expire(key, 2 * 24 * 60 * 60);
    if (used > limit) {
      throw new AppException(HttpStatus.TOO_MANY_REQUESTS, 'QUOTA_EXCEEDED', `You have used today's ${limit} image searches. More tomorrow.`);
    }
    return limit - used;
  }
}
