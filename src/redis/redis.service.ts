import { Injectable } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService {
    private readonly redisClient: Redis;

    constructor() {
        this.redisClient = new Redis(); // Настройте Redis по необходимости
    }

    getClient(): Redis {
        return this.redisClient;
    }
}
