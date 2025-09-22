// FIXME: Исправить у едпоинтов данные на прием - сюда поступает json из оркестатора
//TODO: Обернуть в try/catch generateTokens, createCredentials,

import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { AuthService } from './auth.service';
import { AUTH_PATTERNS } from 'src/contracts/auth.patterns';
import { Role } from '@fra1m-dev/contracts-auth';
// import { JwtPayload } from '@fra1m-dev/contracts-auth';

@Controller()
export class AuthController {
  constructor(private readonly svc: AuthService) {}

  @MessagePattern(AUTH_PATTERNS.CREATE_CREDENTIALS) // 'auth.createCredentials'
  async createCredentials(
    @Payload()
    data: {
      meta: { requestId: string };
      userId: number;
      password: string;
    },
  ) {
    try {
      await this.svc.createCredentials(data.userId, data.password);
      return { ok: true };
    } catch (e: any) {
      throw new RpcException({
        message: e?.message ?? 'createCredentials failed',
      });
    }
  }

  @MessagePattern(AUTH_PATTERNS.GENERATE_TOKENS)
  async issueTokens(
    @Payload()
    data: {
      meta: { requestId: string };
      user: {
        id: number;
        email: string;
        name: string;
        role: Role;
      };
    },
  ) {
    const tokens = await this.svc.generateTokens(data.user);
    // внутри generateTokens — сохранить refresh
    return tokens;
  }

  // @MessagePattern(AUTH_PATTERNS.SAVE_TOKEN)
  // async saveToken(
  //   @Payload()
  //   data: {
  //     meta: { requestId: string };
  //     userId: number;
  //     passwordHash: string;
  //     refreshToken: string;
  //   },
  // ) {
  //   return await this.svc.saveToken(data.userId, data.refreshToken);
  // }

  // @MessagePattern(AUTH_PATTERNS.HASH_PASSWORD)
  // async hashPassword(
  //   @Payload() data: { meta: { requestId: string }; password: string },
  // ) {
  //   const hash = await this.svc.hashPassword(data.password);
  //   return hash;
  // }

  // @MessagePattern(AUTH_PATTERNS.VALIDATE_ACCESS)
  // validateAccess(@Payload() data: { token: string }) {
  //   return this.svc.validateAccessToken(data.token);
  // }

  // @MessagePattern(AUTH_PATTERNS.VALIDATE_REFRESH)
  // validateRefresh(@Payload() data: { token: string }) {
  //   return this.svc.validateRefreshToken(data.token);
  // }

  // @MessagePattern(AUTH_PATTERNS.REMOVE_TOKEN)
  // removeToken(@Payload() data: { refreshToken: string }) {
  //   return this.svc.removeToken(data.refreshToken);
  // }

  // @MessagePattern(AUTH_PATTERNS.FIND_TOKEN)
  // findToken(@Payload() data: { refreshToken: string }) {
  //   return this.svc.findToken(data.refreshToken);
  // }

  // @MessagePattern(AUTH_PATTERNS.COMPARE_PASSWORD)
  // comparePassword(@Payload() data: { candidate: string; stored: string }) {
  //   return this.svc.comparePassword(data.candidate, data.stored);
  // }

  // @MessagePattern(AUTH_PATTERNS.NEW_HASH_PASSWORD)
  // newHashPassword(
  //   @Payload()
  //   data: {
  //     storedCurrent: string;
  //     newPassword: string;
  //     currentPassword?: string;
  //   },
  // ) {
  //   return this.svc.newHashPassword(
  //     data.storedCurrent,
  //     data.newPassword,
  //     data.currentPassword,
  //   );
  // }
}
