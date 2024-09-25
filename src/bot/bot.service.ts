import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { Telegraf } from "telegraf";
import { AuthService } from "../auth/auth.service";
import { PrismaService } from "../prisma/prisma.service";
import * as process from "process";
import { Server } from "socket.io";
import { MyWebSocketGateway } from "../websocket/websocket.gateway";

const YOUR_GROUP_CHAT_ID = process.env.YOUR_GROUP_CHAT_ID || -1002400947474;

@Injectable()
export class BotService implements OnModuleInit {
  private bot: Telegraf;
  private server: Server;

  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
    @Inject(MyWebSocketGateway) private websocketGateway: MyWebSocketGateway
  ) {
    this.bot = new Telegraf(process.env.BOT_TOKEN);
  }

  async onModuleInit() {
    this.server = this.websocketGateway.server;

    this.bot.telegram.setMyCommands([
      { command: "start", description: "Начать работу с ботом" }
    ]);

    this.bot.start(async (ctx) => {
      try {
        const { id, first_name, username, is_premium } = ctx.from;
        const args = ctx.message?.text?.split(" ");

        if (args && args.length > 1) {
          const inviterId = Number(args[1]);

          const inviterRow = await this.prisma.user.findFirst({
            where: { id: inviterId }
          });

          if (inviterId && inviterRow) {
            // Проверка, зарегистрирован ли пользователь уже в системе
            const existingUser = await this.prisma.user.findFirst({
              where: { telegram_id: BigInt(id) }
            });

            if (existingUser) {
              await ctx.reply("Этот пользователь уже зарегистрирован.");
              return;
            }

            // Выполняем регистрацию пользователя
            const user = await this.authService.validateUser(BigInt(id), first_name, username);

            const alreadyInvited = await this.prisma.invite.findFirst({
              where: {
                inviterId: inviterRow.id,
                inviteeId: user.id
              }
            });

            // Проверка на наличие уже существующего приглашения
            if (!alreadyInvited) {
              // Создание новой записи приглашения
              await this.prisma.invite.create({
                data: {
                  inviterId: inviterRow.id,
                  bonus: is_premium ? 25000 : 5000,
                  inviteeId: user.id,
                  isPremium: is_premium || false
                }
              });

              const bonusCoins = is_premium ? 25000 : 5000;
              await this.prisma.user.update({
                where: { id: inviterRow.id },
                data: { coins: { increment: bonusCoins } }
              });

              await this.prisma.user.update({
                where: { id: user.id },
                data: { coins: { increment: bonusCoins } }
              });

              const inviteTask = await this.prisma.task.findFirst({
                where: {
                  type: "INVITE",
                  target: "3"
                }
              });

              if (inviteTask) {
                // Проверяем, не выполнил ли уже пользователь это задание
                const existingUserTask = await this.prisma.userTask.findFirst({
                  where: {
                    userId: inviterRow.id,
                    taskId: inviteTask.id
                  }
                });

                if (!existingUserTask) { // Задание еще не выполнено
                  const inviteCount = await this.prisma.invite.count({
                    where: { inviterId: inviterRow.id }
                  });

                  if (inviteCount >= Number(inviteTask.target)) {
                    await this.prisma.user.update({
                      where: { id: inviterRow.id },
                      data: { coins: { increment: inviteTask.reward } }
                    });

                    await this.prisma.userTask.create({
                      data: {
                        userId: inviterRow.id,
                        taskId: inviteTask.id,
                        status: "completed"
                      }
                    });

                    await ctx.reply(`Задание выполнено! Вы получили ${inviteTask.reward} монет.`);
                  }
                } else {
                  await ctx.reply("Вы уже выполнили это задание.");
                }
              }
              await ctx.reply(`Вы успешно зарегистрированы и приглашены пользователем ID ${inviterId}.`);
              await ctx.reply(`Hey, ${username ?? first_name}! 👋

Welcome to Political Warfare!🏛

You can decide who will be the next president of US! 🇺🇸

Choose your candidate, earn money for the and invite friends to compete🚀!`, {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: "🎲 PLAY 🎲", web_app: { url: process.env.FRONT_URL } }],
                    [{ text: "🚀 Subscribe to the channel 🚀", url: 'https://t.me/politicalwarfare' }],
                  ]
                }
              });
            } else {
              await ctx.reply("Вы уже зарегистрированы и приглашены этим пользователем.");
            }
          }
        } else {
          // Если нет реферальной ссылки, сразу запускаем веб-приложение
          await this.authService.validateUser(BigInt(id), first_name, username);
          await ctx.reply(`Hey, ${username ?? first_name}! 👋

Welcome to Political Warfare!🏛

You can decide who will be the next president of US! 🇺🇸

Choose your candidate, earn money for the and invite friends to compete🚀!`, {
            reply_markup: {
              inline_keyboard: [
                [{ text: "🎲 PLAY 🎲", web_app: { url: process.env.FRONT_URL } }],
                [{ text: "🚀 Subscribe to the channel 🚀", url: 'https://t.me/politicalwarfare' }],
              ]
            }
          });
        }
      } catch (e) {
        console.log('ошибка бота', e)
      }
    });

    this.bot.launch();
  }

  async createGroupInviteLink(): Promise<any> {
    return await this.bot.telegram.createChatInviteLink(YOUR_GROUP_CHAT_ID);
  }

  // Метод для проверки принадлежности к группе и выполнения задания
  async checkUserInGroup(userId: number, chatId?: string): Promise<[string, boolean]> {
    const user = await this.prisma.user.findFirst({
      where: { id: Number(userId) }
    });

    if (!user) {
      return ["Пользователь не найден.", false];
    }

    const isInGroup = await this.checkUserMembershipInGroup(user.telegram_id, chatId ?? YOUR_GROUP_CHAT_ID.toString());

    if (isInGroup) {
      return await this.handleJoinGroup(user.id, chatId);
    } else {
      return ["Пользователь не состоит в группе.", false];
    }
  }

  private async checkUserMembershipInGroup(telegramId: bigint, chatId: string): Promise<boolean> {
    const member = await this.bot.telegram.getChatMember(chatId, Number(telegramId.toString()));
    return member.status !== "left" && member.status !== "kicked";
  }

  private async handleJoinGroup(userId: number, groupId: string): Promise<[string, boolean]> {
    const joinGroupTask = await this.prisma.task.findFirst({
      where: {
        type: "JOIN_GROUP",
        target: groupId
      }
    });

    if (joinGroupTask) {
      const userTask = await this.prisma.userTask.findFirst({
        where: {
          userId: userId,
          taskId: joinGroupTask.id
        }
      });

      if (!userTask) {
        const updatedUser = await this.prisma.user.update({
          where: { id: userId },
          data: { coins: { increment: joinGroupTask.reward } }
        });

        this.server.to(userId.toString()).emit("coinUpdated", {
          userId: userId,
          coins: updatedUser.coins,
          coinsProfit: updatedUser.coinsProfit,
          energy: updatedUser.energy
        });

        await this.prisma.userTask.create({
          data: {
            userId: userId,
            taskId: joinGroupTask.id,
            status: "completed"
          }
        });

        return [`Задание выполнено! Вы получили ${joinGroupTask.reward} монет.`, true];
      }
    }

    return ["Вы уже выполнили это задание.", false];
  }

  async checkUserInChat(userId: number, chatId: string): Promise<[string, boolean]> {
    const user = await this.prisma.user.findFirst({
      where: { id: Number(userId) }
    });

    if (!user) {
      return ["Пользователь не найден.", false];
    }

    const isInChat = await this.checkUserMembershipInChat(user.telegram_id, chatId);

    if (isInChat) {
      return await this.handleJoinChat(user.id, chatId);
    } else {
      return ["Пользователь не состоит в чате.", false];
    }
  }

  private async checkUserMembershipInChat(telegramId: bigint, chatId: string): Promise<boolean> {

    console.log(chatId);

    const member = await this.bot.telegram.getChatMember(chatId, Number(telegramId.toString()));
    return member.status !== "left" && member.status !== "kicked";
  }

  private async handleJoinChat(userId: number, chatId: string): Promise<[string, boolean]> {
    const joinChatTask = await this.prisma.task.findFirst({
      where: {
        type: "JOIN_CHAT",
        target: chatId
      }
    });

    if (joinChatTask) {
      const userTask = await this.prisma.userTask.findFirst({
        where: {
          userId: userId,
          taskId: joinChatTask.id
        }
      });

      if (!userTask) {
        const updatedUser = await this.prisma.user.update({
          where: { id: userId },
          data: { coins: { increment: joinChatTask.reward } }
        });

        this.server.to(userId.toString()).emit("coinUpdated", {
          userId: userId,
          coins: updatedUser.coins,
          coinsProfit: updatedUser.coinsProfit,
          energy: updatedUser.energy
        });

        await this.prisma.userTask.create({
          data: {
            userId: userId,
            taskId: joinChatTask.id,
            status: "completed"
          }
        });

        return [`Задание выполнено! Вы получили ${joinChatTask.reward} монет.`, true];
      }
    }

    return ["Вы уже выполнили это задание.", false];
  }
}
