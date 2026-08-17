import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { Inject } from '@nestjs/common';
import { REDIS_CLIENT } from '../redis/redis.module';
import { Redis } from 'ioredis';

@ApiTags('Health')
@Controller('api/v1/health')
export class HealthController {
  constructor(
    private prisma: PrismaService,
    @Inject(REDIS_CLIENT) private redis: Redis,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Basic health check' })
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('deep')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary:
      '[ADMIN] Deep health telemetry — V8 memory, DB pool, Redis latency (BONUS)',
  })
  async deepCheck() {
    const memoryUsage = process.memoryUsage();

    // Redis ping latency
    const redisStart = Date.now();
    let redisPingMs: number | string = -1;
    let redisStatus = 'ok';
    try {
      await this.redis.ping();
      redisPingMs = Date.now() - redisStart;
    } catch {
      redisStatus = 'error';
      redisPingMs = 'unavailable';
    }

    // Postgres connection check
    const dbStart = Date.now();
    let dbStatus = 'ok';
    let dbLatencyMs: number | string = -1;
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - dbStart;
    } catch {
      dbStatus = 'error';
      dbLatencyMs = 'unavailable';
    }

    return {
      status:
        dbStatus === 'ok' && redisStatus === 'ok' ? 'healthy' : 'degraded',
      uptime: `${Math.floor(process.uptime())}s`,
      timestamp: new Date().toISOString(),
      memory: {
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
        heapUsedPercent: `${Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)}%`,
      },
      database: { status: dbStatus, latencyMs: dbLatencyMs },
      redis: { status: redisStatus, pingMs: redisPingMs },
    };
  }
}
