import { Body, Controller, Post, Param, Put, Req } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from "./user.service";
import { EnergyService } from "../cron/energy.service";

@Controller('users')
export class UsersController {
    constructor(
      private prisma: PrismaService,
      private readonly usersService: UsersService,
      private readonly energyService: EnergyService
    ) {}

    @Post('login')
    async login(@Body() body: { userId: number }, @Req() req: Request) {
        const { userId } = body;
        await this.energyService.startUserProfitTimer(userId);
        return { success: true };
    }

    @Post('logout')
    async logout(@Body('userId') userId: number) {
        await this.energyService.startCoinsHoursAccumulation(userId);
        return { success: true, message: `User ${userId} logged out and coinsHours accumulation started.` };
    }

    @Put(':id/reset-coins-hours')
    async resetCoinsHours(@Param('id') id: number) {
        return this.energyService.resetCoinsHours(id);
    }
}
