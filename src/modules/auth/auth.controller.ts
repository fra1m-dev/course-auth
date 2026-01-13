// FIXME: Исправить у едпоинтов данные на прием - сюда поступает json из оркестатора

import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, RpcException } from '@nestjs/microservices';
import { AuthService } from './auth.service';
import { AUTH_PATTERNS } from 'src/contracts/auth.patterns';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Role, UserModel } from 'src/common/models/user-model';

@Controller()
export class AuthController {
  constructor(
    @InjectPinoLogger(AuthController.name)
    private readonly logger: PinoLogger,
    private readonly svc: AuthService,
  ) {}

  @MessagePattern(AUTH_PATTERNS.VALIDATE_REFRESH)
  async validateRefresh(
    @Payload()
    data: {
      meta: { requestId: string };
      token: string;
    },
  ) {
    const { token } = data;
    this.logger.info(
      {
        rid: data.meta?.requestId,
        token: token,
      },
      `start: ${AUTH_PATTERNS.VALIDATE_REFRESH}`,
    );

    try {
      const res = await this.svc.validateRefreshToken({ token });
      this.logger.info({ ...res }, `end: ${AUTH_PATTERNS.VALIDATE_REFRESH}`);
      return res;
    } catch (e: any) {
      this.logger.error(
        { rid: data.meta?.requestId, err: e },
        AUTH_PATTERNS.VALIDATE_REFRESH,
      );
      throw new RpcException({
        message: e?.message ?? 'Create credentials failed',
      });
    }
  }

  @MessagePattern(AUTH_PATTERNS.VALIDATE_ACCESS)
  async validateAccess(
    @Payload()
    data: {
      meta: { requestId: string };
      token: string;
    },
  ) {
    try {
      const res = await this.svc.validateAccessToken({ token: data.token });
      return res;
    } catch (e: any) {
      this.logger.error(
        { rid: data.meta?.requestId, err: e },
        AUTH_PATTERNS.VALIDATE_ACCESS,
      );
      throw new RpcException({
        message: e?.message ?? 'Invalid credentials',
      });
    }
  }

  // TODO: удалить или реализовать
  @MessagePattern(AUTH_PATTERNS.CREATE_CREDENTIALS)
  async createCredentials(
    @Payload()
    data: {
      meta: { requestId: string };
      userId: number;
      password: string;
    },
  ) {
    this.logger.info(
      {
        rid: data.meta?.requestId,
        userId: data.userId,
        password: '[REDACTED]',
      },
      AUTH_PATTERNS.CREATE_CREDENTIALS,
    );

    try {
      await this.svc.createCredentials(data.userId, data.password);
      return { ok: true };
    } catch (e: any) {
      this.logger.error(
        { rid: data.meta?.requestId, err: e },
        AUTH_PATTERNS.CREATE_CREDENTIALS,
      );
      throw new RpcException({
        message: e?.message ?? 'Create credentials failed',
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
        specializationId: number;
      };
      password?: string;
    },
  ) {
    this.logger.info(
      {
        rid: data.meta?.requestId,
        user: data.user,
      },
      AUTH_PATTERNS.GENERATE_TOKENS,
    );

    try {
      const tokens = await this.svc.generateTokens(data.user, data.password);
      // внутри generateTokens — сохранить refresh
      return tokens;
    } catch (e: any) {
      this.logger.error(
        { rid: data.meta?.requestId, err: e },
        AUTH_PATTERNS.GENERATE_TOKENS,
      );
      throw new RpcException({
        message: e?.message ?? 'Generate tokens failed',
      });
    }
  }

  @MessagePattern(AUTH_PATTERNS.AUTH_BY_PASSWORD)
  async loginByPassword(
    @Payload()
    data: {
      meta: { requestId: string };
      user: UserModel;
      password: string;
    },
  ) {
    this.logger.info(
      { rid: data.meta?.requestId, userId: data.user?.id },
      AUTH_PATTERNS.AUTH_BY_PASSWORD,
    );
    try {
      return await this.svc.loginByPassword({
        user: data.user,
        password: data.password,
      });
    } catch (e: any) {
      this.logger.warn(
        { rid: data.meta?.requestId, userId: data.user?.id, err: e?.message },
        AUTH_PATTERNS.AUTH_BY_PASSWORD,
      );
      // пробрасываем как RPC-ошибку, gateway замапит в 401
      throw new RpcException({ message: 'Invalid credentials' });
    }
  }

  @MessagePattern(AUTH_PATTERNS.REMOVE_TOKEN)
  async removeToken(
    @Payload()
    data: {
      meta: { requestId: string };
      refreshToken?: string;
      token?: string;
    },
  ) {
    try {
      const refreshToken = data.refreshToken ?? data.token;
      await this.svc.removeToken(refreshToken ?? '');
      return true;
    } catch (e: any) {
      this.logger.warn(
        { rid: data.meta?.requestId, err: e?.message },
        AUTH_PATTERNS.REMOVE_TOKEN,
      );
      throw new RpcException({ message: 'Invalid credentials' });
    }
  }
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
