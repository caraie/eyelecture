import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** What came back when a deck was turned into a PDF. */
export interface Converted {
  targetKey: string;
  sizeBytes: number;
}

/**
 * The client for the LibreOffice service.
 *
 * It is a separate Cloud Run service, private, reachable only by this API's
 * identity. The call is authenticated with a Google-signed ID token fetched
 * from the metadata server — there is no key anywhere, and the token is good
 * only for this one audience.
 *
 * Off entirely when `CONVERTER_URL` is empty, which is every local build. The
 * API then refuses a PowerPoint upload up front rather than accepting a deck it
 * could never show.
 */
@Injectable()
export class ConverterService {
  private readonly logger = new Logger(ConverterService.name);

  constructor(private readonly config: ConfigService) {}

  get isAvailable(): boolean {
    return Boolean(this.baseUrl);
  }

  private get baseUrl(): string {
    return (this.config.get<string>('converter.url') ?? '').replace(/\/+$/, '');
  }

  /**
   * Convert one object in the bucket and write the PDF to another key.
   *
   * Throws with the converter's own message when it fails: the author is the
   * one who has to do something about a deck LibreOffice cannot open, and
   * "conversion failed" tells them nothing.
   */
  async toPdf(
    bucket: string,
    sourceKey: string,
    targetKey: string,
  ): Promise<Converted> {
    if (!this.isAvailable) {
      throw new ServiceUnavailableException(
        'PowerPoint conversion is not available in this environment',
      );
    }

    const url = `${this.baseUrl}/convert`;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };

    const token = await this.identityToken(this.baseUrl);
    if (token) headers['authorization'] = `Bearer ${token}`;

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ bucket, sourceKey, targetKey }),
    });

    const body = (await response.json().catch(() => ({}))) as Partial<Converted> & {
      message?: string;
    };

    if (!response.ok) {
      throw new Error(body.message ?? `The converter answered ${response.status}`);
    }
    if (!body.targetKey) {
      throw new Error('The converter answered without saying what it wrote');
    }

    return { targetKey: body.targetKey, sizeBytes: Number(body.sizeBytes ?? 0) };
  }

  /**
   * An ID token for the converter, from Cloud Run's metadata server.
   *
   * Absent off Google, where there is no metadata server — the request then
   * goes out unauthenticated, which only ever happens against a converter
   * somebody is running locally on purpose.
   */
  private async identityToken(audience: string): Promise<string | null> {
    try {
      const response = await fetch(
        'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity' +
          `?audience=${encodeURIComponent(audience)}`,
        { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(2000) },
      );
      if (!response.ok) return null;
      return (await response.text()).trim() || null;
    } catch {
      this.logger.debug('No metadata server; calling the converter unauthenticated');
      return null;
    }
  }
}
