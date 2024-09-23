import {Global, Module} from '@nestjs/common';
import {EnergyService} from "./energy.service";
import {PrismaService} from "../prisma/prisma.service";
import {RedisService} from "../redis/redis.service";


@Global()
@Module({
    providers: [EnergyService, PrismaService, RedisService],
    exports: [EnergyService],
})
export class EnergyModule {}
