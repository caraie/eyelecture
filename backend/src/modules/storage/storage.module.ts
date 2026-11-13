import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { StorageService } from './storage.service';
import { GcsStorage } from './gcs.storage';
import { LocalStorage } from './local.storage';
import { LocalStorageController } from './storage.controller';
import { ConverterService } from './converter.service';

const driver = (config: ConfigService): string =>
  (config.get<string>('STORAGE_DRIVER') ?? 'local').toLowerCase();

/**
 * One of two storage drivers, chosen by `STORAGE_DRIVER`.
 *
 * The local controller is registered either way but only does anything when
 * the local driver is active — the alternative is a conditional module, and a
 * controller that 400s on an expired token it can never issue is cheaper than
 * dynamic module wiring.
 *
 * Cloud Storage is loaded lazily inside the factory so that a developer
 * running locally never pays for the client, and so the tests do not need
 * credentials for a bucket they will not touch.
 */
@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // `jwt.accessSecret` from the config namespace, not a bare env var.
        // The deployed environments pass JWT_ACCESS_SECRET from Secret Manager
        // and there is no JWT_SECRET anywhere — asking for one by that name
        // threw at boot and the container never answered its startup probe.
        secret: config.getOrThrow<string>('jwt.accessSecret'),
      }),
    }),
  ],
  controllers: [LocalStorageController],
  providers: [
    LocalStorage,
    ConverterService,
    {
      provide: StorageService,
      inject: [ConfigService, LocalStorage],
      useFactory: (config: ConfigService, local: LocalStorage): StorageService =>
        driver(config) === 'gcs' ? new GcsStorage(config) : local,
    },
  ],
  exports: [StorageService, ConverterService],
})
export class StorageModule {}
