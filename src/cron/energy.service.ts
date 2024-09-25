import { Injectable, OnModuleInit, Inject } from "@nestjs/common";
import * as cron from "node-cron";
import { PrismaService } from "../prisma/prisma.service";
import { MyWebSocketGateway } from "../websocket/websocket.gateway";
import { Server } from "socket.io";
import Redis from "ioredis";
import { RedisService } from "../redis/redis.service";

const PROFIT_INTERVAL_MS = 1 * 1000; // Каждую секунду
const PROFIT_DURATION_MS = 3 * 60 * 60 * 1000; // 3 часа в миллисекундах

@Injectable()
export class EnergyService implements OnModuleInit {
  private server: Server;
  private redisClient: Redis;
  private isEnergyRecoveryStarted = false;  // Флаг для проверки, был ли метод запущен
  private activeProfitTimers = new Map<number, NodeJS.Timeout>();  // Хранит активные таймеры пользователей

  constructor(
      private prisma: PrismaService,
      @Inject(MyWebSocketGateway) private websocketGateway: MyWebSocketGateway,
      private redisService: RedisService
  ) {
  }

  onModuleInit() {
    if (!this.isEnergyRecoveryStarted) {
      this.server = this.websocketGateway.server;
      this.redisClient = this.redisService.getClient();
      this.startEnergyRecovery();
      this.isEnergyRecoveryStarted = true;  // Устанавливаем флаг после запуска метода
    }
  }

  private async updateUserEnergy(userId: number, newEnergy: number) {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { energy: newEnergy }
      });

      if (this.server) {

        if (userId === 3)
        console.log('newEnergy', newEnergy, 'userId', userId);

        this.server.to(userId.toString()).emit("energyUpdated", {
          userId,
          energy: newEnergy,
          recover: true
        });
      }
    } catch (e) {
      console.error(`Failed to update energy for user ${userId}:`, e);
    }
  }

  async handleUpgradeLevelUp(userId: number, updatedUser: any, userCache: any) {
    const nextLevel = await this.prisma.userLevel.findFirst({
      where: {
        required_xp: { lte: updatedUser.coinsProfit },
        level: { gt: userCache.levelId }
      },
      orderBy: { level: "asc" }
    });

    if (nextLevel) {
      await this.prisma.userLevelOnUser.deleteMany({
        where: {
          userId: updatedUser.id,
          levelId: { lt: nextLevel.id }
        }
      });

      await this.prisma.userLevelOnUser.create({
        data: {
          userId: updatedUser.id,
          levelId: nextLevel.id
        }
      });

      if (this.server) {
        this.server.to(userId.toString()).emit("levelUpdated", {
          userId: updatedUser.id,
          level: nextLevel.level
        });
      }
    }
  }

  private async updateUserCoins(userId: number, profitChunk: number, addToCoinsHours: boolean = false) {
    try {
      const dataToUpdate = {
        coinsProfit: { increment: profitChunk },
        coins: { increment: profitChunk }
      };

      if (addToCoinsHours) {
        dataToUpdate["coinsHours"] = { increment: profitChunk };
      }

      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: dataToUpdate,
        include: { levels: true }
      });

      if (updatedUser) {
        await this.handleUpgradeLevelUp(userId, updatedUser, {
          levelId: updatedUser.levels?.[0]?.levelId
        });
      }

      if (this.server) {
        this.server.to(userId.toString()).emit("coinUpdated", {
          userId,
          coins: updatedUser.coins,
          coinsProfit: updatedUser.coinsProfit,
          coinsHours: updatedUser.coinsHours, // Отправляем обновленное значение coinsHours
          energy: updatedUser.energy
        });
      }

      return updatedUser;
    } catch (e) {
      console.error(`Failed to update coins for user ${userId}:`, e);
      return null;
    }
  }

  private startEnergyRecovery() {
    console.log("Starting energy recovery...");

    cron.schedule("* * * * * *", async () => { // Запуск задачи каждую секунду
      const users = await this.prisma.user.findMany({
        select: {
          id: true, energy: true, levels: {
            select: { levelId: true }
          }
        }
      });

      try {
        for (const user of users) {

          const userLevel = await this.prisma.userLevel.findFirst({
            where: { id: user.levels?.[0]?.levelId },
            select: { energy_limit: true }
          });

          if (!userLevel) continue;

          const energyLimit = userLevel.energy_limit;

          if (user.energy < energyLimit) {
            const newEnergy = user.energy + 10;

            if (user.energy !== newEnergy) {
              await this.updateUserEnergy(user.id, newEnergy);
            }
          }
        }
      } catch (e) {
        console.error("Error during energy recovery:", e);
      }
    });
  }

  private async processProfit(userId: number, addToCoinsHours: boolean = false) {
    // Проверяем, не активен ли уже таймер для этого пользователя
    if (this.activeProfitTimers.has(userId)) {
      // Перезапуск таймера
      clearInterval(this.activeProfitTimers.get(userId));
      this.activeProfitTimers.delete(userId);
    }

    const profitInterval = setInterval(async () => {
      const updatedUser = await this.prisma.user.findFirst({ where: { id: userId }, select: { profit: true } });
      const updatedProfitPerSecond = updatedUser.profit / 3600;

      await this.updateUserCoins(userId, Number(updatedProfitPerSecond.toFixed(2)), addToCoinsHours);
    }, PROFIT_INTERVAL_MS);

    // Сохраняем таймер в Map
    this.activeProfitTimers.set(userId, profitInterval);

    // Остановить начисление через 3 часа, если пользователь неактивен
    setTimeout(async () => {
      clearInterval(profitInterval);
      this.activeProfitTimers.delete(userId); // Удаляем таймер из активных
      await this.redisClient.set(`user:${userId}:profitInactive`, "true", "PX", PROFIT_DURATION_MS);
      console.log(`Profit earning stopped for user ${userId} due to 3 hours of activity.`);
    }, PROFIT_DURATION_MS);
  }

  public async startUserProfitTimer(userId: number) {
    // Сбросить таймер неактивности пользователя
    await this.redisClient.del(`user:${userId}:profitInactive`);

    const isInactive = await this.redisClient.get(`user:${userId}:profitInactive`);

    if (!isInactive) {
      console.log(`Starting or restarting profit timer for user ${userId}`);
      await this.processProfit(userId);
    } else {
      console.log(`User ${userId} is currently in the inactive state.`);
    }
  }

  public async startCoinsHoursAccumulation(userId: number) {
    await this.processProfit(userId, true);
  }

  public async resetCoinsHours(userId: number) {
    try {
      await this.prisma.user.update({
        where: { id: Number(userId) },
        data: {
          coinsHours: 0 // Сбрасываем coinsHours
        }
      });

      return { success: true };
    } catch (e) {
      console.error(`Failed to reset coinsHours for user ${userId}:`, e);
      return { success: false, error: e.message };
    }
  }
}
