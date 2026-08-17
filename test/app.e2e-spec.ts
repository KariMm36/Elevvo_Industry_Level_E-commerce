import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { REDIS_CLIENT } from '../src/redis/redis.module';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';

describe('E-Commerce API (e2e)', () => {
  let app: INestApplication;
  let mockPrisma: any;
  let mockRedis: any;

  beforeAll(async () => {
    mockPrisma = {
      $connect: jest.fn(),
      $disconnect: jest.fn(),
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      product: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      $transaction: jest.fn().mockImplementation((args) => {
        if (Array.isArray(args)) return Promise.all(args);
        return args(mockPrisma);
      }),
    };

    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      keys: jest.fn().mockResolvedValue([]),
      ping: jest.fn().mockResolvedValue('PONG'),
      lpush: jest.fn().mockResolvedValue(1),
      rpop: jest.fn().mockResolvedValue(null),
      incr: jest.fn().mockResolvedValue(1),
      pttl: jest.fn().mockResolvedValue(60000),
      pexpire: jest.fn().mockResolvedValue(1),
      psetex: jest.fn().mockResolvedValue('OK'),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .overrideProvider(REDIS_CLIENT)
      .useValue(mockRedis)
      .compile();

    app = moduleFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.useGlobalInterceptors(new TransformInterceptor());
    app.useGlobalFilters(new AllExceptionsFilter());

    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  describe('Health Endpoints', () => {
    it('GET /api/v1/health — should return 200 with standard envelope', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ok');
    });

    it('GET /api/v1/health/deep — should return 401 Unauthorized without JWT', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/health/deep');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  describe('Products Catalog', () => {
    it('GET /api/v1/products — should return product list with 200 OK', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/products');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toEqual([]);
    });

    it('GET /api/v1/products with X-Currency header — should include currency metadata', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('x-currency', 'EUR');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.currency).toBe('EUR');
    });
  });

  describe('Validation & Security', () => {
    it('POST /api/v1/auth/register with empty body — should return 400 Bad Request with validation errors', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(Array.isArray(res.body.message)).toBe(true);
    });

    it('GET /api/v1/cart without auth — should return 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/cart');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});
