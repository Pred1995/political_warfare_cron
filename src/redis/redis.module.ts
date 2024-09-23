import { Module } from '@nestjs/common';
import { RedisService } from './redis.service'; // Создайте этот файл в следующем шаге

@Module({
    providers: [RedisService],
    exports: [RedisService],
})
export class RedisModule {}
