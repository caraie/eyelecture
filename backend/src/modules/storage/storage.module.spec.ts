import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { StorageModule } from './storage.module';
import { StorageService } from './storage.service';
import { LocalStorage } from './local.storage';
import { configuration } from '../../config/configuration';

/**
 * Boots the module the way the deployed app does — through the real config
 * factory, with only the environment variables the deployed app actually has.
 *
 * This exists because of a specific failure: the module asked for `JWT_SECRET`,
 * which is not a name anything sets. Locally it fell back to a value in .env
 * and everything passed; on Cloud Run, where the secret arrives as
 * JWT_ACCESS_SECRET, `getOrThrow` threw during bootstrap, the container never
 * answered its startup probe and the deploy rolled back. Nothing in the suite
 * noticed, because nothing in the suite had ever started this module.
 */
describe('StorageModule', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.JWT_SECRET;
    delete process.env.STORAGE_DRIVER;
    delete process.env.STORAGE_BUCKET;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('starts with the environment the deployed API is given', async () => {
    process.env.JWT_ACCESS_SECRET = 'whatever-the-secret-manager-holds';

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [configuration],
          ignoreEnvFile: true,
        }),
        StorageModule,
      ],
    }).compile();

    expect(moduleRef.get(StorageService)).toBeDefined();
  });

  /** Nothing is set at all: the local driver has to be the default. */
  it('falls back to the local driver when none is named', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [configuration],
          ignoreEnvFile: true,
        }),
        StorageModule,
      ],
    }).compile();

    expect(moduleRef.get(StorageService)).toBeInstanceOf(LocalStorage);
  });
});
