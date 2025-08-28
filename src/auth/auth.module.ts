import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { OidcService } from './oidc.service';
import { KeycloakAdminService } from './keycloak-admin.service';
import { SessionLimitService } from './session-limit.service';
import { AuditService } from './audit.service';
import { AuthGuard } from './auth.guard';
import { RolesGuard } from './roles.guard';

@Module({
  controllers: [AuthController],
  providers: [
    OidcService,
    KeycloakAdminService,
    SessionLimitService,
    AuditService,
    AuthGuard, // ✅ añadimos AuthGuard
    RolesGuard, // ✅ añadimos RolesGuard
  ],
  exports: [
    OidcService,
    KeycloakAdminService,
    SessionLimitService,
    AuditService,
    AuthGuard, // ✅ exportamos para otros módulos
    RolesGuard, // ✅ exportamos para otros módulos
  ],
})
export class AuthModule {}
