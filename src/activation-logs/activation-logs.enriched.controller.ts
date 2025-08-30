import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '@prisma/client';
import { EnrichedLogsQueryDto } from './dto/enriched-logs.query.dto';
import { ActivationLogsEnrichedService } from './activation-logs.enriched.service';

@Controller('activation-logs')
@UseGuards(AuthGuard, RolesGuard)
export class ActivationLogsEnrichedController {
  constructor(private readonly service: ActivationLogsEnrichedService) {}

  @Get('enriched')
  @Roles(Role.SUPERADMIN, Role.ADMIN, Role.GUARDIA)
  async getEnriched(@Req() req: Request, @Query() query: EnrichedLogsQueryDto) {
    return this.service.findEnriched(req, query);
  }
}
