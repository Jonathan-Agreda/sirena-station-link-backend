import { INestApplication, Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }

  /**
   * Cierre ordenado sin usar prisma.$on('beforeExit')
   * - cierra Prisma en 'beforeExit'
   * - cierra Nest y Prisma en señales de sistema (Ctrl+C, kill, etc.)
   */
  async enableShutdownHooks(app: INestApplication) {
    // Antes de que Node termine, asegúrate de soltar conexiones
    process.on('beforeExit', async () => {
      await this.$disconnect();
    });

    const onSignal = async () => {
      try {
        await app.close();
        await this.$disconnect();
      } finally {
        process.exit(0);
      }
    };

    (['SIGINT', 'SIGTERM', 'SIGQUIT'] as NodeJS.Signals[]).forEach((sig) => {
      process.on(sig, onSignal);
    });
  }
}
