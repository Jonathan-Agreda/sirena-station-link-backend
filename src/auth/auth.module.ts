import { Module } from '@nestjs/common';
import { OidcService } from './oidc.service';
import { AuthController } from './auth.controller';

@Module({
  providers: [OidcService],
  controllers: [AuthController],
  exports: [OidcService],
})
export class AuthModule {}
