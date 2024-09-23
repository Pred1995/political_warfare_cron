import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
    constructor(private prisma: PrismaService) {}

    async getFractionStats(): Promise<{ fraction: string, totalCoinsProfit: number, percentage: number }[]> {
        const fractionStats = await this.prisma.user.groupBy({
            by: ['fraction'],
            _sum: {
                coins: true,
            },
        });

        const totalCoinsProfit = fractionStats.reduce((sum, stat) => sum + (stat._sum.coins || 0), 0);

        return fractionStats.map(stat => {
            const totalCoinsProfitFraction = stat._sum.coins || 0;
            const percentage = totalCoinsProfit > 0 ? (totalCoinsProfitFraction / totalCoinsProfit) * 100 : 0;
            return {
                fraction: stat.fraction,
                totalCoinsProfit: totalCoinsProfitFraction,
                percentage: Math.round(percentage * 100) / 100, // Округление до двух знаков после запятой
            };
        });
    }

    async getLeaderboard(limit: number = 10): Promise<any[]> {
        return this.prisma.user.findMany({
            orderBy: {
                profit: 'desc', // Сортировка по количеству коинов в порядке убывания
            },
            where: {
                banned: false,
            },
            take: limit, // Ограничение количества записей
            select: {
                id: true, first_name: true,
                username: true, levels: true, fraction: true,
                profit: true,
            },
        });
    }

    // Другие методы сервиса
}
