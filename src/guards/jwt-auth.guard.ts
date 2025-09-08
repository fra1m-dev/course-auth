import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import type { Request } from 'express';
import { JwtPayload } from 'src/interfaces/jwt-payload.interface';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: JwtPayload }>();
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new HttpException(
        'Вам необходимо авторизоваться',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const [bearer, token] = authHeader.split(' ');
    if (bearer !== 'Bearer' || !token) {
      throw new HttpException(
        'Вам необходимо авторизоваться',
        HttpStatus.UNAUTHORIZED,
      );
    }

    try {
      const user = this.jwtService.verify<JwtPayload>(token);
      req.user = user;
      return true;
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        throw new HttpException('Токен истек', HttpStatus.UNAUTHORIZED);
      }
      throw new HttpException('Доступ запрещён', HttpStatus.FORBIDDEN);
    }
  }
}
