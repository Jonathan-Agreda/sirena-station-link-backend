import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { Roles } from './roles.decorator';
import { RolesGuard } from './roles.guard';

@Controller('auth')
export class AuthController {
  @UseGuards(AuthGuard)
  @Get('me')
  me(@Req() req: any) {
    const u = req.user;
    return {
      sub: u.sub,
      email: u.email,
      username: u.username,
      roles: u.roles,
    };
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @Get('admin-ping')
  adminPing() {
    return { ok: true };
  }
}
