import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ROLES_KEY } from 'src/decorators/roles-auth.decorator';
import { JwtPayload } from 'src/interfaces/jwt-payload.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles?.length) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const authHeader = req.headers.authorization;
    if (!authHeader)
      throw new UnauthorizedException('Нет заголовка авторизации');

    const [bearer, token] = authHeader.split(' ');
    if (bearer !== 'Bearer' || !token) {
      throw new UnauthorizedException('Вам необходимо авторизоваться');
    }

    try {
      const user = this.jwtService.verify<JwtPayload>(token);
      req.user = user;

      const roles = Array.isArray(user.role) ? user.role : [user.role];
      const ok = roles.some((r) => requiredRoles.includes(r));
      if (!ok)
        throw new HttpException('Недостаточно прав', HttpStatus.FORBIDDEN);

      return true;
    } catch {
      throw new HttpException('Доступ запрещён', HttpStatus.FORBIDDEN);
    }
  }
}
