import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService {
  private readonly redisClient: Redis;

  constructor() {
    this.redisClient = new Redis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT),
    });
  }

  async get(key: string) {
    const data = await this.redisClient.hgetall(key);
    return Object.fromEntries(
      Object.entries(data).map(([field, value]) => [field, value]),
    );
  }

  async set(key: string, value: object) {
    console.log('set', Object.entries(value));
    return await this.redisClient.hset(key, Object.entries(value));
  }

  async setField(key: string, field: string, value: string) {
    return await this.redisClient.hset(key, field, value);
  }

  async delete(key: string) {
    return await this.redisClient.del(key);
  }
}
