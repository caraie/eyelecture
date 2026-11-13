import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { StorageService, UploadTicket } from './storage.service';

const UPLOAD_TTL_SECONDS = 60 * 60;
const READ_TTL_SECONDS = 6 * 60 * 60;

/**
 * Lecture files on disk, for development and for the tests.
 *
 * It keeps the same shape as Cloud Storage rather than offering a shortcut:
 * the "signed URL" is a URL back to this API carrying a short-lived token, so
 * the browser performs the same plain PUT it would perform against a bucket.
 * One upload path in the frontend, and the thing developers exercise locally is
 * the thing that runs in production.
 *
 * The token is a JWT rather than a guessable path. Without it this would be an
 * endpoint that writes a file wherever the caller says, which is a remote
 * code-drop waiting for someone to find it.
 */
@Injectable()
export class LocalStorage extends StorageService {
  private readonly root: string;
  private readonly apiUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {
    super();
    this.root = resolve(config.get<string>('STORAGE_LOCAL_DIR') ?? './.storage');
    this.apiUrl = (
      config.get<string>('API_URL') ?? 'http://localhost:3000'
    ).replace(/\/$/, '');
  }

  async uploadUrl(key: string, contentType: string): Promise<UploadTicket> {
    const token = await this.jwt.signAsync(
      { key, contentType, scope: 'storage:write' },
      { expiresIn: UPLOAD_TTL_SECONDS },
    );

    return {
      url: `${this.apiUrl}/api/v1/storage/local?token=${encodeURIComponent(token)}`,
      headers: { 'Content-Type': contentType },
      expiresAt: new Date(Date.now() + UPLOAD_TTL_SECONDS * 1000),
    };
  }

  async readUrl(key: string, filename?: string): Promise<string> {
    const token = await this.jwt.signAsync(
      { key, filename, scope: 'storage:read' },
      { expiresIn: READ_TTL_SECONDS },
    );
    return `${this.apiUrl}/api/v1/storage/local?token=${encodeURIComponent(token)}`;
  }

  async stat(key: string): Promise<{ size: number } | null> {
    try {
      const info = await stat(this.pathFor(key));
      return { size: info.size };
    } catch {
      return null;
    }
  }

  async remove(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }

  /** Used by the controller that serves this driver's URLs. */
  async write(key: string, body: Buffer): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  pathFor(key: string): string {
    // The key is built by the server, but it ends up in a filesystem path, so
    // it gets checked anyway: a key that climbs out of the root would let a
    // bug upstream turn into an arbitrary write.
    const safe = createHash('sha256').update(key).digest('hex').slice(0, 8);
    const path = resolve(join(this.root, key));
    if (!path.startsWith(this.root)) {
      throw new Error(`Refusing to touch a path outside the store (${safe})`);
    }
    return path;
  }

  verify(token: string): { key: string; contentType?: string; filename?: string; scope: string } {
    return this.jwt.verify(token);
  }
}
