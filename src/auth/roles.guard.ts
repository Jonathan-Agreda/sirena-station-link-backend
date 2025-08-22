import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core'; // ⬅️ viene de @nestjs/core
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const roles: string[] = (req.user?.roles || []).map((r: string) =>
      r.toUpperCase(),
    );
    const ok = required.some((need) => roles.includes(need.toUpperCase()));
    if (!ok) throw new ForbiddenException('Insufficient role');
    return true;
  }
}
