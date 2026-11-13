import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bucket, Storage } from '@google-cloud/storage';
import { StorageService, UploadTicket } from './storage.service';

/** Long enough to upload a large video on a poor connection, short enough to matter. */
const UPLOAD_TTL_MS = 60 * 60 * 1000;
/** Long enough to watch a lecture through without the link dying mid-video. */
const READ_TTL_MS = 6 * 60 * 60 * 1000;

@Injectable()
export class GcsStorage extends StorageService {
  private readonly logger = new Logger(GcsStorage.name);
  private readonly bucket: Bucket;

  constructor(config: ConfigService) {
    super();
    const bucketName = config.getOrThrow<string>('STORAGE_BUCKET');
    // No credentials passed on purpose: on Cloud Run the library picks up the
    // service account from the metadata server. Signing then goes through the
    // IAM Credentials API, which is why that account needs to be allowed to
    // impersonate itself — see infra/storage.tf.
    this.bucket = new Storage().bucket(bucketName);
  }

  async uploadUrl(key: string, contentType: string): Promise<UploadTicket> {
    const expiresAt = new Date(Date.now() + UPLOAD_TTL_MS);
    const [url] = await this.bucket.file(key).getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: expiresAt,
      // Pinned, so a URL issued for a PDF cannot be used to put something else
      // there. The browser must send exactly this header back.
      contentType,
    });

    return { url, headers: { 'Content-Type': contentType }, expiresAt };
  }

  async readUrl(key: string, filename?: string): Promise<string> {
    const [url] = await this.bucket.file(key).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: new Date(Date.now() + READ_TTL_MS),
      ...(filename
        ? {
            responseDisposition: `inline; filename="${filename.replace(/"/g, '')}"`,
          }
        : {}),
    });
    return url;
  }

  async stat(key: string): Promise<{ size: number } | null> {
    try {
      const [metadata] = await this.bucket.file(key).getMetadata();
      return { size: Number(metadata.size ?? 0) };
    } catch (error) {
      if ((error as { code?: number }).code === 404) return null;
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.bucket.file(key).delete();
    } catch (error) {
      if ((error as { code?: number }).code === 404) {
        // Already gone. The row that pointed at it is about to disappear too,
        // and failing here would leave the lecture holding a dead reference.
        this.logger.warn(`Tried to delete ${key}, which was not there`);
        return;
      }
      throw error;
    }
  }
}
