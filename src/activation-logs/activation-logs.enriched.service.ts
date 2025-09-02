import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../data/prisma.service';
import { EnrichedLogsQueryDto } from './dto/enriched-logs.query.dto';
import type { AuthUser } from '../auth/auth.guard';

function isSuperAdmin(roles?: string[]) {
  return Array.isArray(roles) && roles.includes('SUPERADMIN');
}

@Injectable()
export class ActivationLogsEnrichedService {
  constructor(private readonly prisma: PrismaService) {}

  async findEnriched(req: any, dto: EnrichedLogsQueryDto) {
    const currentUser = (req['user'] || {}) as AuthUser;

    const where: Prisma.ActivationLogWhereInput = {};

    // Por defecto solo ACCEPTED (a menos que includeRejected = true)
    const includeRejected = dto.includeRejected === 'true';
    if (!includeRejected) where.result = 'ACCEPTED';

    if (dto.action) where.action = dto.action;

    if (dto.from || dto.to) {
      where.createdAt = {};
      if (dto.from) (where.createdAt as any).gte = new Date(dto.from);
      if (dto.to) (where.createdAt as any).lte = new Date(dto.to);
    }

    if (dto.q && dto.q.trim()) {
      const q = dto.q.trim();
      where.OR = [
        { siren: { deviceId: { contains: q, mode: 'insensitive' } } }, // deviceId === “nombre”
        { user: { username: { contains: q, mode: 'insensitive' } } },
        { user: { firstName: { contains: q, mode: 'insensitive' } } },
        { user: { lastName: { contains: q, mode: 'insensitive' } } },
      ];
    }

    // Multi-tenant: ADMIN/GUARDIA limitan por su urbanización
    if (!isSuperAdmin(currentUser?.roles) && currentUser?.urbanizationId) {
      where.siren = { urbanizationId: currentUser.urbanizationId };
    }

    const page = dto.page ?? 1;
    const take = dto.perPage ?? 50;
    const skip = (page - 1) * take;

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.activationLog.count({ where }),
      this.prisma.activationLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          siren: { select: { id: true, deviceId: true, urbanizationId: true } },
          user: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              etapa: true,
              manzana: true,
              villa: true,
              cedula: true,
              celular: true,
            },
          },
        },
      }),
    ]);

    const data = rows.map((r) => {
      const user = r.user
        ? {
            id: r.user.id,
            username: r.user.username ?? '—',
            fullName:
              `${r.user.firstName ?? ''} ${r.user.lastName ?? ''}`.trim() ||
              '—',
            etapa: r.user.etapa ?? null,
            manzana: r.user.manzana ?? null,
            villa: r.user.villa ?? null,
            cedula: r.user.cedula ?? null,
            celular: r.user.celular ?? null,
          }
        : {
            id: null,
            username: 'system',
            fullName: 'Sistema',
            etapa: null,
            manzana: null,
            villa: null,
            cedula: null,
            celular: null,
          };

      return {
        id: r.id,
        deviceId: r.siren?.deviceId ?? r.sirenId,
        user,
        action: r.action,
        result: r.result,
        reason: r.reason,
        ip: r.ip,
        createdAt: r.createdAt,
      };
    });

    return {
      page,
      perPage: take,
      total,
      hasNext: skip + rows.length < total,
      data,
    };
  }
}
