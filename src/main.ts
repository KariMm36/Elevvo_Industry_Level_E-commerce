import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { EventsService } from './events/events.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── Global Pipes ──────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip unknown fields
      forbidNonWhitelisted: true, // Throw on unknown fields
      transform: true, // Auto-transform types
    }),
  );

  // ── Global Interceptor & Filter ───────────────────────────────────────
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  // ── Swagger Documentation ─────────────────────────────────────────────
  const config = new DocumentBuilder()
    .setTitle('🛒 Enterprise E-Commerce API')
    .setDescription(
      'Task 10 Capstone: NestJS + Prisma + Redis — Full E-Commerce Platform with JWT Auth, Cart, Atomic Checkout, Order Lifecycle, Returns, Reviews, and Deep Telemetry',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Auth', 'Register and login')
    .addTag('Addresses', 'Shipping address book')
    .addTag('Products', 'Product catalog with caching and currency conversion')
    .addTag('Cart', 'Shopping cart management')
    .addTag('Orders', 'Idempotent atomic checkout and order management')
    .addTag('Returns', 'Return requests and admin resolution')
    .addTag('Reviews', 'Verified-buyer product reviews')
    .addTag('Health', 'System telemetry and deep health check')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // ── Start Redis Event Worker ──────────────────────────────────────────
  const eventsService = app.get(EventsService);
  eventsService.startWorker();

  const PORT = process.env.PORT ?? 3000;
  await app.listen(PORT);

  console.log('═══════════════════════════════════════════════════════');
  console.log('  🛒  Enterprise E-Commerce API — Task 10');
  console.log(`  Server  → http://localhost:${PORT}`);
  console.log(`  Swagger → http://localhost:${PORT}/api/docs`);
  console.log(`  Health  → http://localhost:${PORT}/api/v1/health`);
  console.log('═══════════════════════════════════════════════════════');
}

bootstrap();
