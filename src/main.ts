import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { PrismaService } from './data/prisma.service';
import { IoAdapter } from '@nestjs/platform-socket.io';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Prefijo global
  app.setGlobalPrefix('api');

  // Seguridad y performance
  app.use(helmet());
  app.use(compression());
  app.use(cookieParser());

  // CORS con credenciales (para cookies HttpOnly del refresh en web)
  app.enableCors({
    origin: (origin, cb) => {
      const list = (config.get<string>('CORS_ORIGINS') || '')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
      if (!origin || list.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
    credentials: true,
  });

  // Validación DTO (para futuras fases)
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidUnknownValues: false,
    }),
  );

  // ⬇️ habilita cierre ordenado
  const prisma = app.get(PrismaService);
  await prisma.enableShutdownHooks(app);

  app.useWebSocketAdapter(new IoAdapter(app));

  const port = config.get<number>('PORT') ?? 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`🚀 SirenaStationLink API -> http://localhost:${port}/api`);
}
bootstrap();
