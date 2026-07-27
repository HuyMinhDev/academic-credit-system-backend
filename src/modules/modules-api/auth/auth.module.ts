import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TokenModule } from 'src/modules/modules-system/token/token.module';
// đường dẫn đúng tới file ProtectStrategy
import { PrismaService } from 'src/modules/modules-system/prisma/prisma.service';
import { ProtectStrategy } from 'src/common/protect/protect.strategy';
import { ACCESS_TOKEN_SECRET } from 'src/common/constant/app.constant';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from 'src/modules/modules-system/token/token.service';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: ACCESS_TOKEN_SECRET,
      signOptions: { expiresIn: '1d' },
    }),
    TokenModule,
    PassportModule.register({ defaultStrategy: 'protect' }), // Đăng ký passport với strategy mặc định
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, ProtectStrategy, PrismaService],
  exports: [PassportModule, JwtStrategy],
})
export class AuthModule {}
