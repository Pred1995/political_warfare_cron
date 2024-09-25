import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async createAdmin(email: string, password: string) {
    const hashedPassword = await bcrypt.hash(password, 10);
    return this.prisma.admin.create({
      data: {
        email,
        password: hashedPassword,
      },
    });
  }

  async validateAdmin(email: string, password: string) {
    const admin = await this.prisma.admin.findFirst({ where: { email } });
    if (admin && await bcrypt.compare(password, admin.password)) {
      return admin;
    }
    return null;
  }

  async getAdminById(adminId: number) {
    return this.prisma.admin.findFirst({ where: { id: adminId } });
  }

  async getUsers(
    page: number,
    limit: number,
    sort: string,
    order: 'asc' | 'desc',
    filter: string
  ) {
    const offset = (page - 1) * limit;

    const usersFilter = filter
      ? {
        OR: [
          { first_name: { contains: filter, mode: 'insensitive' } },
          { username: { contains: filter, mode: 'insensitive' } },
        ],
      }
      : {};

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        // @ts-ignore
        where: usersFilter,
        orderBy: { [sort]: order },
        skip: offset,
        take: Number(limit),
        select: {
          id: true,
          first_name: true,
          username: true,
          email: true,
          coins: true,
          profit: true,
          created_at: true,
          banned: true,
          fraction: true,
        },
      }),
      this.prisma.user.count({
        // @ts-ignore
        where: usersFilter,
      }),
    ]);

    return {
      users,
      totalUsers: total,
      page,
      lastPage: Math.ceil(total / limit),
    };
  }
  async banUser(userId: number, banned: boolean) {

    await this.prisma.user.update({
      where: { id: userId },
      data: { banned: banned },
    })

    return {
      message: 'Пользователь забанен',
    };
  }
}
