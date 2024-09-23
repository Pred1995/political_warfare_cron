// jwt.strategy.ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AdminService } from './admin.service';

@Injectable()
export class JwtAdminStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly adminService: AdminService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET || '123123',
    });
  }

  async validate(payload: any) {
    const admin = await this.adminService.getAdminById(payload.sub);
    if (!admin) {
      throw new Error('Unauthorized');
    }
    return admin;
  }
}
