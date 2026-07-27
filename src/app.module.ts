import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './modules/modules-system/prisma/prisma.module';
import { AuthModule } from './modules/modules-api/auth/auth.module';
import { TokenModule } from './modules/modules-system/token/token.module';

// import { ImageModule } from './modules/modules-api/image/image.module';
import { UserModule } from './modules/modules-api/user/user.module';
// import { CommentModule } from './modules/modules-api/comment/comment.module';
import { FileModule } from './modules/modules-api/file/file.module';
import { LocationModule } from './modules/modules-api/location/location.module';
import { RoomModule } from './modules/modules-api/room/room.module';
import { CommentModule } from './modules/modules-api/comment/comment.module';
import { FavoriteModule } from './modules/modules-api/favorite/favorite.module';
import { BookingModule } from './modules/modules-api/booking/booking.module';
import { HealthModule } from './modules/modules-api/health/health.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    TokenModule,
    // ImageModule,
    UserModule,
    // CommentModule,
    FileModule,
    LocationModule,
    RoomModule,
    CommentModule,
    FavoriteModule,
    BookingModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
//ArticleModule
