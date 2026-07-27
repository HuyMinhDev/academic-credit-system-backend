import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { PORT } from './common/constant/app.constant';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ProtectGuard } from './common/protect/protect.guard';

let app: any;

async function bootstrap() {
  app = await NestFactory.create(AppModule);
  const reflector = app.get(Reflector);
  // Enable CORS
  app.enableCors({
    origin: true, // Allow all origins in development
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  //Global
  app.setGlobalPrefix('api');
  //Chuyển type global validation
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  // app.useGlobalInterceptors(new LoggingInterceptor());
  // app.useGlobalInterceptors(new ResponseSuccesInterceptor(reflector));
  app.useGlobalGuards(new ProtectGuard(reflector));
  // app.useGlobalGuards(new PermissionGuard(reflector));

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Aparment Bussiness')
    .setDescription('The cats API description')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        in: 'header',
        name: 'Authorization',
      },
      'access-token',
    )
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api-docs', app, documentFactory, {
    swaggerOptions: { persistAuthorization: true }, //Giup luu lai token sau moi lan f5
  });

  const logger = new Logger('Bootstrap');
  await app.listen(PORT ?? 3069, () => {
    logger.log(`Server is running on http://localhost:${PORT}`);
  });
  return app;
}

// Vercel serverless handler
if (process.env.VERCEL) {
  bootstrap().then(() => {
    console.log('NestJS bootstrap done on Vercel');
  });
} else {
  bootstrap();
}

export default async (req: any, res: any) => {
  if (!app) {
    await bootstrap();
  }
  return app.getHttpAdapter().getInstance()(req, res);
};
