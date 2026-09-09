import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const uploadsPath = join(process.cwd(), 'uploads');
  mkdirSync(join(uploadsPath, 'usuarios'), { recursive: true });
  mkdirSync(join(uploadsPath, 'productos'), { recursive: true });
  app.useStaticAssets(uploadsPath, { prefix: '/uploads/' });

  app.setGlobalPrefix('api/v1');
  app.enableCors();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => {
        const messages = errors.map(
          (e) => `${e.property}: ${Object.values(e.constraints || {}).join(', ')}`,
        );
        return new BadRequestException(messages.join('; '));
      },
    }),
  );

  app.useGlobalFilters(new AllExceptionsFilter());

  app.use(json({ limit: '10mb' }));
  app.use(urlencoded({ extended: true, limit: '10mb' }));

  const config = new DocumentBuilder()
    .setTitle('CRM API')
    .setDescription('API del CRM contable multiempresa')
    .setVersion('0.1')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('swagger', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`CRM API running on http://localhost:${port}/api/v1`);
  console.log(`Swagger UI on http://localhost:${port}/swagger`);
}
bootstrap();
