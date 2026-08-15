import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.use(helmet());
  // Behind a load balancer (Cloud Run, nginx) so req.ip reflects the real client.
  app.set('trust proxy', 1);

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.enableCors({
    origin: config.getOrThrow<string[]>('corsOrigins'),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  if (config.get<string>('nodeEnv') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('EyeLecture API')
      .setDescription(
        'Accounts, roles, institutions and student validation for EyeLecture.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    SwaggerModule.setup(
      'api/docs',
      app,
      SwaggerModule.createDocument(app, swaggerConfig),
      { swaggerOptions: { persistAuthorization: true } },
    );
  }

  const port = config.getOrThrow<number>('port');
  await app.listen(port, '0.0.0.0');

  logger.log(`API listening on http://localhost:${port}/api/v1`);
  if (config.get<string>('nodeEnv') !== 'production') {
    logger.log(`Swagger UI at http://localhost:${port}/api/docs`);
  }
}

void bootstrap();
