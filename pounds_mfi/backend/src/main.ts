import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as helmet from 'helmet';
import * as compression from 'compression';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { AuditLog } from './modules/audit/entities/audit-log.entity';
import { getRepositoryToken } from '@nestjs/typeorm';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  const config = app.get(ConfigService);

  // Security
  app.use(helmet.default());
  app.use(compression());

  // CORS
  app.enableCors({
    origin: [
      config.get('app.frontendUrl'),
      'http://localhost:3000',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Filters
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Interceptors
  app.useGlobalInterceptors(new TransformInterceptor());

  // Swagger
  if (config.get('app.env') !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Pounds MFI API')
      .setDescription('Microfinance Management System API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = config.get<number>('app.port') || 3001;
  await app.listen(port, '0.0.0.0');
  logger.log(`Server running on port ${port} [${config.get('app.env')}]`);
  logger.log(`API: http://localhost:${port}/api/v1`);
}

bootstrap().catch((err) => {
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
