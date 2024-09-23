import {Controller, Post, Body, Get, Query, UnauthorizedException, HttpException, HttpStatus} from "@nestjs/common";
import { AuthService } from './auth.service';
import { AdminService } from "../admin/admin.service";
import { JwtService } from "@nestjs/jwt";

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService, private readonly adminService: AdminService,
              private readonly jwtService: JwtService) {}

  @Post('login')
  async login(@Body() body: { email: string; password: string }) {
    const admin = await this.adminService.validateAdmin(body.email, body.password);
    if (!admin) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { sub: admin.id, email: admin.email };
    const token = this.jwtService.sign(payload);

    return { token };
  }

  @Post('telegram')
  async authenticateTelegramUser(
    @Body('telegram_id') telegramId: bigint,
    @Body('first_name') firstName: string,
    @Body('username') username: string,
  ) {
    const user = await this.authService.validateUser(telegramId, firstName, username);

    if (user.banned) {
        throw new HttpException('ban', HttpStatus.FORBIDDEN);
    }

    const token = await this.authService.getTokenByTelegramId(telegramId);

    return { token, user: {
        id: user.id,
        first_name: user.first_name,
        seeInstruction: user.seeInstruction,
            fraction: user.fraction,
        username: user.username,
            energy: user.energy,
        coins: user.coins,
        created_at: user.created_at,
        coinsHours: user.coinsHours,
        profit: user.profit,
            coinsProfit: user.coinsProfit,
            level: user.levels[0].levelId
      } };
  }

  @Get('token')
  async getToken(
    @Query('telegram_id') telegramId: bigint,
  ) {
    const token = await this.authService.getTokenByTelegramId(telegramId);
    if (!token) {
      return { error: 'User not found or no token available' };
    }
    return { token };
  }
}
