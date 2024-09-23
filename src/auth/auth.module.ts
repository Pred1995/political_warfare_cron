import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PrismaModule } from "../prisma/prisma.module";
import { AdminService } from "../admin/admin.service";

@Module({
  imports: [
    PassportModule,
    PrismaModule,
    JwtModule.register({
      secret: '123123', // лучше хранить в .env
      signOptions: { expiresIn: '600m' }, // Время жизни токена
    }),
  ],
  providers: [AuthService, AdminService],
  controllers: [AuthController],
  exports: [AuthService], 
})
export class AuthModule {}
