import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  ForbiddenException,
  UnauthorizedException,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ActivationLogService } from './activation-log.service';
import { DevicesService } from './devices.service';
import { ActivationAction, ActivationResult } from '@prisma/client';

@Catch(ForbiddenException, UnauthorizedException)
@Injectable()
export class DeviceCmdExceptionFilter
  implements ExceptionFilter<ForbiddenException | UnauthorizedException>
{
  constructor(
    private readonly activationLog: ActivationLogService,
    private readonly devicesService: DevicesService,
  ) {}

  async catch(
    exception: ForbiddenException | UnauthorizedException,
    host: ArgumentsHost,
  ): Promise<void> {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const deviceId = req.params?.deviceId;

    if (req.method === 'POST' && deviceId) {
      try {
        const kcUser: any = (req as any).user;
        const siren = await this.devicesService.findByDeviceId(deviceId);

        // Normalizar acción
        const rawAction = (req.body as any)?.action;
        const upper =
          typeof rawAction === 'string' ? rawAction.toUpperCase() : 'ON';
        const known: ActivationAction[] = ['ON', 'OFF', 'AUTO_OFF'] as any;
        const action: ActivationAction = (
          known.includes(upper as any) ? upper : 'ON'
        ) as ActivationAction;

        // 🔹 Resolver userId de forma segura
        let userId: string | null = null;
        if (kcUser?.dbId) {
          userId = kcUser.dbId;
        } else if (kcUser?.sub) {
          const dbUser = await this.devicesService.findUserByKeycloakId(
            kcUser.sub,
          );
          userId = dbUser?.id ?? null; // si no existe → null
        }

        // Guardar log REJECTED
        await this.activationLog.record({
          sirenId: siren?.id ?? deviceId,
          userId,
          action,
          result: ActivationResult.REJECTED,
          reason:
            (exception as any)?.message ??
            (exception as any)?.name ??
            'FORBIDDEN',
          ip: req.ip,
        });
      } catch (e) {
        console.error('[DeviceCmdExceptionFilter] Error guardando log', e);
      }
    }

    // Respuesta al cliente
    const status = (exception as any)?.getStatus?.() ?? 403;
    const payload = (exception as any)?.getResponse?.() ?? {
      statusCode: status,
      message: (exception as any)?.message ?? 'Forbidden',
    };

    res.status(status).json(payload);
  }
}
