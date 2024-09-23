import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersController } from './user.controller';
import {UsersService} from "./user.service";
import {RedisService} from "../redis/redis.service";

@Module({
    controllers: [UsersController],
    providers: [PrismaService, UsersService, RedisService],
    exports: [UsersService],
})
export class UsersModule {}
