import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { PrismaModule } from "./prisma/prisma.module";
import { EnergyModule } from "./cron/energy.module";
import { WebSocketModule } from "./websocket/websocket.module";
import { RedisModule } from "./redis/redis.module";
import { UsersModule } from "./user/user.module";

@Module({
  imports: [PrismaModule, EnergyModule, RedisModule, UsersModule, WebSocketModule],
  controllers: [AppController],
  providers: [AppService]
})
export class AppModule {}
 