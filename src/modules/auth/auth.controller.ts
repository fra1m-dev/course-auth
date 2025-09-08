import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AuthService } from './auth.service';
import { AUTH_PATTERNS } from 'src/contracts/auth.patterns';
import { JwtPayload } from 'src/interfaces/jwt-payload.interface';

@Controller()
export class AuthController {
  constructor(private readonly svc: AuthService) {}

  @MessagePattern(AUTH_PATTERNS.GENERATE_TOKENS)
  generateTokens(@Payload() data: { user: JwtPayload }) {
    return this.svc.generateTokens(data.user);
  }

  @MessagePattern(AUTH_PATTERNS.VALIDATE_ACCESS)
  validateAccess(@Payload() data: { token: string }) {
    return this.svc.validateAccessToken(data.token);
  }

  @MessagePattern(AUTH_PATTERNS.VALIDATE_REFRESH)
  validateRefresh(@Payload() data: { token: string }) {
    return this.svc.validateRefreshToken(data.token);
  }

  @MessagePattern(AUTH_PATTERNS.SAVE_TOKEN)
  saveToken(@Payload() data: { userId: string; refreshToken: string }) {
    return this.svc.saveToken(data.userId, data.refreshToken);
  }

  @MessagePattern(AUTH_PATTERNS.REMOVE_TOKEN)
  removeToken(@Payload() data: { refreshToken: string }) {
    return this.svc.removeToken(data.refreshToken);
  }

  @MessagePattern(AUTH_PATTERNS.FIND_TOKEN)
  findToken(@Payload() data: { refreshToken: string }) {
    return this.svc.findToken(data.refreshToken);
  }

  @MessagePattern(AUTH_PATTERNS.HASH_PASSWORD)
  hashPassword(@Payload() data: { password: string }) {
    return this.svc.hashPassword(data.password);
  }

  @MessagePattern(AUTH_PATTERNS.COMPARE_PASSWORD)
  comparePassword(@Payload() data: { candidate: string; stored: string }) {
    return this.svc.comparePassword(data.candidate, data.stored);
  }

  @MessagePattern(AUTH_PATTERNS.NEW_HASH_PASSWORD)
  newHashPassword(
    @Payload()
    data: {
      storedCurrent: string;
      newPassword: string;
      currentPassword?: string;
    },
  ) {
    return this.svc.newHashPassword(
      data.storedCurrent,
      data.newPassword,
      data.currentPassword,
    );
  }
}
