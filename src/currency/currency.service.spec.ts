import { Test, TestingModule } from '@nestjs/testing';
import { CurrencyService } from './currency.service';
import { REDIS_CLIENT } from '../redis/redis.module';

describe('CurrencyService', () => {
  let service: CurrencyService;
  let redis: { get: jest.Mock; setex: jest.Mock };

  beforeEach(async () => {
    redis = {
      get: jest.fn(),
      setex: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CurrencyService, { provide: REDIS_CLIENT, useValue: redis }],
    }).compile();

    service = module.get<CurrencyService>(CurrencyService);
  });

  it('should return original price when currency is USD', async () => {
    const converted = await service.convertPrice(100, 'USD');
    expect(converted).toBe(100);
    expect(redis.get).not.toHaveBeenCalled();
  });

  it('should convert price using EUR base exchange rate and cache it', async () => {
    redis.get.mockResolvedValue(null); // cache miss
    const converted = await service.convertPrice(100, 'EUR');
    expect(converted).toBe(92); // 100 * 0.92
    expect(redis.setex).toHaveBeenCalledWith('exchange_rate:EUR', 3600, '0.92');
  });

  it('should convert price using cached rate from Redis if present', async () => {
    redis.get.mockResolvedValue('50.0'); // cached EGP rate
    const converted = await service.convertPrice(10, 'EGP');
    expect(converted).toBe(500); // 10 * 50.0
  });

  it('should format product and product lists with converted currency attributes', async () => {
    redis.get.mockResolvedValue(null);
    const product = { id: 'p1', name: 'Keyboard', price: 50 };
    const result = await service.convertProduct(product, 'SAR');
    expect(result.price).toBe(187.5); // 50 * 3.75
    expect(result.currency).toBe('SAR');
  });
});
