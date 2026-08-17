import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: { $queryRaw: jest.Mock };
  let redis: { ping: jest.Mock };

  beforeEach(async () => {
    prisma = {
      $queryRaw: jest.fn(),
    };

    redis = {
      ping: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: prisma },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  describe('check', () => {
    it('should return basic health liveness probe', () => {
      const res = controller.check();
      expect(res.status).toBe('ok');
      expect(res.timestamp).toBeDefined();
    });
  });

  describe('deepCheck (Task 10 Bonus)', () => {
    it('should return deep telemetry metrics including V8 memory, DB latency, and Redis latency', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redis.ping.mockResolvedValue('PONG');

      const res = await controller.deepCheck();

      expect(res.status).toBe('healthy');
      expect(res.memory).toBeDefined();
      expect(res.memory.heapUsed).toContain('MB');
      expect(res.memory.heapTotal).toContain('MB');
      expect(res.memory.heapUsedPercent).toContain('%');
      expect(res.database.status).toBe('ok');
      expect(typeof res.database.latencyMs).toBe('number');
      expect(res.redis.status).toBe('ok');
      expect(typeof res.redis.pingMs).toBe('number');
      expect(res.uptime).toBeDefined();
    });

    it('should report degraded status if Redis is down', async () => {
      prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
      redis.ping.mockRejectedValue(new Error('Redis connection lost'));

      const res = await controller.deepCheck();

      expect(res.status).toBe('degraded');
      expect(res.redis.status).toBe('error');
      expect(res.redis.pingMs).toBe('unavailable');
    });
  });
});
