import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { Public } from '../../common/decorators/public.decorator';
import { LocalStorage } from './local.storage';

/**
 * Serves the URLs the local storage driver hands out. Registered only when that
 * driver is in use — in the deployed environments the browser talks to Cloud
 * Storage and this controller does not exist.
 *
 * `@Public` because the token in the query string *is* the authentication: the
 * browser PUTs straight here, as it would to a bucket, and carrying a session
 * on top of a signed URL would be two mechanisms for one job. The token is
 * short-lived, names the exact key, and says whether it may read or write.
 */
@ApiExcludeController()
@Controller('storage/local')
export class LocalStorageController {
  constructor(private readonly storage: LocalStorage) {}

  @Public()
  @Put()
  @HttpCode(HttpStatus.OK)
  async upload(
    @Query('token') token: string,
    @Body() body: Buffer,
  ): Promise<{ ok: true }> {
    const claims = this.verify(token, 'storage:write');
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new BadRequestException('Nothing to store');
    }

    await this.storage.write(claims.key, body);
    return { ok: true };
  }

  @Public()
  @Get()
  @Header('Cache-Control', 'private, max-age=0, no-store')
  async download(
    @Query('token') token: string,
    @Res() response: Response,
  ): Promise<void> {
    const claims = this.verify(token, 'storage:read');

    const info = await this.storage.stat(claims.key);
    if (!info) throw new NotFoundException('That file is not here');

    if (claims.filename) {
      response.setHeader(
        'Content-Disposition',
        `inline; filename="${claims.filename.replace(/"/g, '')}"`,
      );
    }
    response.setHeader('Content-Length', String(info.size));
    createReadStream(this.storage.pathFor(claims.key)).pipe(response);
  }

  private verify(token: string, scope: string) {
    if (!token) throw new BadRequestException('This link is missing its token');

    let claims: { key: string; scope: string; filename?: string };
    try {
      claims = this.storage.verify(token);
    } catch {
      // Expired and forged are the same answer on purpose: telling them apart
      // tells whoever is probing which half of the problem to work on.
      throw new BadRequestException('This link has expired');
    }

    if (claims.scope !== scope) {
      throw new BadRequestException('This link is not for that');
    }
    return claims;
  }
}
