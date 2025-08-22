import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { OidcService } from './oidc.service';
import { KeycloakAdminService } from './keycloak-admin.service';
import { SessionLimitService } from './session-limit.service';
import { AuditService } from './audit.service';

@Module({
  controllers: [AuthController],
  providers: [
    OidcService,
    KeycloakAdminService,
    SessionLimitService,
    AuditService,
  ],
  exports: [
    OidcService,
    KeycloakAdminService,
    SessionLimitService,
    AuditService,
  ],
})
export class AuthModule {}
