import 'reflect-metadata';
import * as fs from 'fs';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const uploadsDir = process.env.UPLOADS_DIR || './uploads';
  fs.mkdirSync(uploadsDir, { recursive: true });

  const app = await NestFactory.create(AppModule);

  // Content-Security-Policy is left disabled here deliberately: helmet's
  // default CSP would block the Google Fonts <link> tags and needs to be
  // tested against the real production bundle before enabling — a good
  // follow-up, not something to guess at in this task. Every other header
  // helmet sets (X-Content-Type-Options, X-Frame-Options, etc.) is safe to
  // enable unconditionally and has no known interaction with this app.
  app.use(helmet({ contentSecurityPolicy: false }));

  const isProduction = process.env.NODE_ENV === 'production';
  const corsOriginEnv = process.env.CORS_ORIGIN;
  let corsOrigin: string[] | boolean;
  if (!corsOriginEnv) {
    // Unset CORS_ORIGIN used to silently reflect any origin (origin: true)
    // regardless of environment. Now it only does that outside production —
    // production with no CORS_ORIGIN configured denies cross-origin requests
    // by default instead of reflecting the caller's Origin header.
    corsOrigin = !isProduction;
  } else {
    const origins = corsOriginEnv.split(',').map((o) => o.trim());
    corsOrigin = origins.length === 1 && origins[0] === '*' ? true : origins;
  }
  app.enableCors({ origin: corsOrigin, credentials: true });

  if (!isProduction) {
    // eslint-disable-next-line no-console
    console.warn(
      '[viq] NODE_ENV is not "production" — CORS will reflect any request Origin ' +
      '(the permissive dev default). If this is a real deployment, set ' +
      'NODE_ENV=production in your environment before starting the server.',
    );
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  app.setGlobalPrefix('api');

  const port = process.env.PORT ? Number(process.env.PORT) : 4001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`jetflow listening on http://localhost:${port}`);
}

bootstrap();
