import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './modules/modules-system/prisma/prisma.module';
import { AuthModule } from './modules/modules-api/auth/auth.module';
import { TokenModule } from './modules/modules-system/token/token.module';

import { UserModule } from './modules/modules-api/user/user.module';
import { OrganizationModule } from './modules/modules-api/organization/organization.module';
import { FileModule } from './modules/modules-api/file/file.module';
import { HealthModule } from './modules/modules-api/health/health.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    TokenModule,
    UserModule,
    OrganizationModule,
    FileModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
//ArticleModule
