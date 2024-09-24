import { Injectable, OnModuleInit, Inject } from "@nestjs/common";
import * as cron from "node-cron";
import { PrismaService } from "../prisma/prisma.service";
import { MyWebSocketGateway } from "../websocket/websocket.gateway";
import { Server } from "socket.io";
import Redis from "ioredis";
import { RedisService } from "../redis/redis.service";

const PROFIT_CHECK_INTERVAL_MS = 60000; // Каждую минуту (60 секунд)
const PROFIT_INTERVAL_MS = 1000; // Каждую секунду
const PROFIT_DURATION_MS = 3 * 60 * 60 * 1000; // 3 часа в миллисекундах
const BATCH_UPDATE_INTERVAL_MS = 60000; // Обновление в базу каждые 60 секунд
const THRESHOLD_TO_UPDATE_DB = 100; // Порог накопления профита для записи в базу

@Injectable()
export class EnergyService implements OnModuleInit {
  private server: Server;
  private redisClient: Redis;
  private activeProfitTimers = new Set<number>(); // Хранит активных пользователей

  constructor(
    private prisma: PrismaService,
    @Inject(MyWebSocketGateway) private websocketGateway: MyWebSocketGateway,
    private redisService: RedisService
  ) {}

  onModuleInit() {
    this.server = this.websocketGateway.server;
    this.redisClient = this.redisService.getClient();

    this.startBatchProfitProcess(); // Единый процесс для начисления профита
    this.startEnergyRecovery(); // Запуск восстановления энергии
  }

  // Восстановление энергии
  private startEnergyRecovery() {
    cron.schedule("*/5 * * * * *", async () => {
      const users = await this.prisma.user.findMany({
        select: { id: true, energy: true, levels: { select: { levelId: true } } }
      });

      const usersToUpdate = [];
      for (const user of users) {
        const userLevel = await this.prisma.userLevel.findFirst({
          where: { id: user.levels?.[0]?.levelId },
          select: { energy_limit: true }
        });

        if (!userLevel) continue;

        const energyLimit = userLevel.energy_limit;
        if (user.energy < energyLimit) {
          const newEnergy = user.energy + 10;
          usersToUpdate.push({ id: user.id, newEnergy });
        }
      }

      if (usersToUpdate.length > 0) {
        await this.updateUserEnergyBatch(usersToUpdate); // Батчевое обновление
      }
    });
  }

  // Обновление энергии батчем
  private async updateUserEnergyBatch(users: any[]) {
    const updates = users.map(user => {
      return this.prisma.user.update({
        where: { id: user.id },
        data: { energy: user.newEnergy }
      });
    });
    await this.prisma.$transaction(updates); // Выполняем все обновления в транзакции

    // Оповещаем всех пользователей через WebSocket
    users.forEach(user => {
      if (this.server) {
        this.server.to(user.id.toString()).emit("energyUpdated", {
          userId: user.id,
          energy: user.newEnergy,
        });
      }
    });
  }

  // Начисление профита с использованием Redis для временного хранения
  private async processProfitInRedis(userId: number, profitChunk: number, addToCoinsHours: boolean = false) {

    const redisKey = `user:${userId}:newProfit`;
    const currentProfit = (await this.redisClient.get(redisKey)) || 0;
    const updatedProfit = Number(currentProfit) + profitChunk;

    // Обновляем временный профит в Redis
    await this.redisClient.set(redisKey, updatedProfit);

    // Оповещаем пользователя через WebSocket, даже если профит не записан в базу
    if (this.server) {
      this.server.to(userId.toString()).emit("coinUpdated", {
        userId,
        coinsProfit: updatedProfit,
        coins: profitChunk,
        plus: true
      });
    }

    // Если накопленный профит достиг порога, записываем в базу
    if (updatedProfit >= THRESHOLD_TO_UPDATE_DB) {
      const dataToUpdate = {
        coinsProfit: { increment: updatedProfit },
        coins: { increment: updatedProfit }
      };

      if (addToCoinsHours) {
        dataToUpdate["coinsHours"] = { increment: updatedProfit };
      }

      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: dataToUpdate,
        include: { levels: true }
      });

      // Проверяем и обновляем уровень пользователя, если нужно
      if (updatedUser) {
        await this.handleUpgradeLevelUp(userId, updatedUser, {
          levelId: updatedUser.levels?.[0]?.levelId,
        });

        // Оповещаем пользователя о новом уровне через WebSocket
        if (this.server) {
          this.server.to(userId.toString()).emit("coinUpdated", {
            userId,
            coins: updatedUser.coins,
            coinsProfit: updatedUser.coinsProfit,
            coinsHours: updatedUser.coinsHours,
            energy: updatedUser.energy
          });
        }
      }

      // Сбрасываем накопленный профит в Redis
      await this.redisClient.set(redisKey, 0);
    }
  }

  // Единый процесс для начисления профита
  private startBatchProfitProcess() {
    setInterval(async () => {
      const activeUsers = Array.from(this.activeProfitTimers);
      if (activeUsers.length === 0) return;

      for (const userId of activeUsers) {
        const updatedUser = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { profit: true }
        });

        const updatedProfitPerSecond = updatedUser.profit / 3600;
        await this.processProfitInRedis(userId, Number(updatedProfitPerSecond.toFixed(2)));
      }
    }, PROFIT_INTERVAL_MS);

    // Периодическое сохранение профита из Redis в базу данных
    setInterval(async () => {
      const users = await this.redisClient.keys("user:*:newProfit");
      for (const userKey of users) {
        const userId = Number(userKey.split(":")[1]);
        const profit = await this.redisClient.get(userKey);

        if (Number(profit) > 0) {
          await this.prisma.user.update({
            where: { id: userId },
            data: {
              coinsProfit: { increment: Number(profit) },
              coins: { increment: Number(profit) }
            }
          });

          if (this.server) {
            this.server.to(userId.toString()).emit("coinUpdated", {
              userId,
              coinsProfit: Number(profit),
            });
          }

          await this.redisClient.set(userKey, 0); // Сбрасываем кеш
        }
      }
    }, BATCH_UPDATE_INTERVAL_MS);
  }

  public async startUserProfitTimer(userId: number) {
    const isInactive = await this.redisClient.get(`user:${userId}:profitInactive`);
    if (!isInactive) {
      this.activeProfitTimers.add(userId); // Добавляем пользователя в активные
      console.log(`Starting or restarting profit timer for user ${userId}`);
    }
  }

  public async stopUserProfitTimer(userId: number) {
    setTimeout(async () => {
      this.activeProfitTimers.delete(userId); // Удаляем пользователя из активных
      await this.redisClient.set(`user:${userId}:profitInactive`, "true", "PX", PROFIT_DURATION_MS);
      console.log(`Profit earning stopped for user ${userId} due to 3 hours of activity.`);
    }, PROFIT_DURATION_MS);
  }

  // Проверка и повышение уровня пользователя
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

      // Оповещаем пользователя о повышении уровня через WebSocket
      if (this.server) {
        this.server.to(userId.toString()).emit("levelUpdated", {
          userId: updatedUser.id,
          level: nextLevel.level
        });
      }
    }
  }

  public async startCoinsHoursAccumulation(userId: number) {
    await this.processProfitInRedis(userId, 0, true);
  }

  public async resetCoinsHours(userId: number) {
    try {
      await this.prisma.user.update({
        where: { id: Number(userId) },
        data: {
          coinsHours: 0 // Сбросить coinsHours
        }
      });

      return { success: true };
    } catch (e) {
      console.error(`Failed to reset coinsHours for user ${userId}:`, e);
      return { success: false, error: e.message };
    }
  }
}
