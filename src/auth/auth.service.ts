import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private prisma: PrismaService, private jwtService: JwtService) {}

  async validateUser(telegramId: bigint, firstName: string, username: string): Promise<any> {
    let user = await this.prisma.user.findUnique({
      where: { telegram_id: telegramId }, include: {
        levels: true
      }
    });

    if (!user) {

      const firstLevel = await this.prisma.userLevel.findFirst({
        where: {
          level: 1
        }
      })

      if (firstLevel) {
        user = await this.prisma.user.create({
          include: { levels: true },
          data: {
            telegram_id: telegramId,
            first_name: firstName,
            username: username ?? '',
            levels: {
              create: [
                {
                  level: {
                    connect: { id: firstLevel.id },
                  },
                },
              ],
            },
          },
        });
      }
    }

    return user;
  }

  async getTokenByTelegramId(telegramId: bigint): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { telegram_id: telegramId },
    });

    if (!user) {
      return null;
    }

    // Генерация JWT токена
    const payload = { username: user.username, sub: user.id };
    return this.jwtService.sign(payload);
  }
}
