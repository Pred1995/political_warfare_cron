import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { AuthModule } from "../auth/auth.module";
import {PrismaModule} from "../prisma/prisma.module";

@Module({
  providers: [BotService],
  controllers: [BotController],
  imports: [AuthModule, PrismaModule],
})
export class BotModule {}
