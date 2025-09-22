//TODO: Сделать логику обновления токена после создания едпоинта авторизации

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TokenEntity } from './entities/auth.entity';
import { Role } from '@fra1m-dev/contracts-auth';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(TokenEntity)
    private readonly tokens: Repository<TokenEntity>,
    private readonly cfg: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  // ---------- JWT (RS256) ----------
  /**
   * Выдать пару токенов и сохранить refresh для userId
   */
  async generateTokens(user: {
    id: number;
    email: string;
    name: string;
    role: Role;
  }): Promise<{ accessToken: string; refreshToken: string }> {
    const accessPrivate = this.cfg.getOrThrow<string>('JWT_PRIVATE_KEY');
    const refreshPrivate = this.cfg.getOrThrow<string>(
      'JWT_REFRESH_PRIVATE_KEY',
    );

    const accessTtl = this.cfg.get('JWT_ACCESS_TTL') ?? '30m';
    const refreshTtl = this.cfg.get('JWT_REFRESH_TTL') ?? '30d';

    const accessToken = await this.jwt.signAsync(user, {
      algorithm: 'RS256',
      privateKey: accessPrivate,
      expiresIn: accessTtl,
    });

    const refreshToken = await this.jwt.signAsync(user, {
      algorithm: 'RS256',
      privateKey: refreshPrivate,
      expiresIn: refreshTtl,
    });

    await this.tokens.save(
      this.tokens.create({
        userId: user.id,
        token: refreshToken,
        passwordHash: null,
      }),
    );

    return { accessToken, refreshToken };
  }

  /**
   * Создать/обновить учётные данные пользователя:
   * - хэшируется пароль
   * - upsert по userId (token может быть null до выдачи refresh)
   */
  async createCredentials(userId: number, password: string): Promise<void> {
    const passwordHash = await this.hashPassword(password);

    // Ищем запись по userId — либо создаём новую
    const existing = await this.tokens.findOne({ where: { userId } });
    if (existing) {
      existing.passwordHash = passwordHash;
      await this.tokens.save(existing);
      return;
    }

    const row = this.tokens.create({
      userId,
      passwordHash,
      token: null, // refresh проставим при выдаче токенов
    });
    await this.tokens.save(row);
  }

  async saveToken(userId: number, refreshToken: string): Promise<void> {
    const tokenData = await this.tokens.findOne({ where: { userId } });

    if (tokenData) {
      tokenData.token = refreshToken;
      await this.tokens.save(tokenData);
      return;
    }
    await this.tokens.save(this.tokens.create({ userId, token: refreshToken }));
  }

  async hashPassword(password: string): Promise<string> {
    const rounds = Number(this.cfg.get('SALT_ROUNDS') ?? 10);
    const hashed: string = await bcrypt.hash(password, rounds);
    return hashed;
  }

  // TODO: Сделать логику смены пароля (скопированно из микр. users) - после создания ендпоинта авторизации
  // async changePasswordUser(
  //   updateUserDto: ResetPasswordDto,
  //   userJwtf: JwtPayload,
  // ) {
  //   const user = await this.getUserByEmail(userJwtf.email);

  //   if (!user) throw new NotFoundException('Пользователь не найден');

  //   const newPassword = await this.authService.newHashPassword(
  //     user,
  //     updateUserDto.newPassword,
  //     updateUserDto.currentPassword,
  //   );

  //   user.password = newPassword;
  //   user.role = Role.STUDENT;
  //   await this.userRepository.save(user);

  //   return newPassword ? true : false;
  // }

  // async validateAccessToken(token: string): Promise<JwtPayload | null> {
  //   try {
  //     //FIXME: в монолите тут тотже ключ что и для accessToken - надо подумать может надо публичный
  //     const pub = this.cfg.getOrThrow<string>('JWT_PRIVATE_KEY');
  //     return await this.jwt.verifyAsync<JwtPayload>(token, {
  //       algorithms: ['RS256'],
  //       publicKey: pub,
  //     });
  //   } catch {
  //     return null;
  //   }
  // }

  // async validateRefreshToken(token: string): Promise<JwtPayload | null> {
  //   try {
  //     const pub =
  //       //FIXME: в монолите тут тотже ключ что и для refreshToken - надо подумать может надо публичный
  //       this.cfg.get<string>('JWT_REFRESH_PRIVATE_KEY') ??
  //       this.cfg.getOrThrow<string>('JWT_PUBLIC_KEY');
  //     return await this.jwt.verifyAsync<JwtPayload>(token, {
  //       algorithms: ['RS256'],
  //       publicKey: pub,
  //     });
  //   } catch {
  //     return null;
  //   }
  // }

  // // ---------- Refresh storage ----------

  // async removeToken(refreshToken: string): Promise<void> {
  //   await this.tokens.delete({ token: refreshToken });
  // }

  // async findToken(refreshToken: string): Promise<{ userId: number } | null> {
  //   const t = await this.tokens.findOne({ where: { token: refreshToken } });
  //   return t ? { userId: t.userId } : null;
  // }

  // // ---------- Password helpers ----------
  // private looksLikeBcrypt(hash?: string): boolean {
  //   return !!hash && hash.startsWith('$2') && hash.length > 30;
  // }

  // /** Сравнение кандидата и сохранённого пароля (поддерживает легаси-плейнтекст) */
  // async comparePassword(candidate: string, stored: string): Promise<boolean> {
  //   if (this.looksLikeBcrypt(stored)) {
  //     const ok: boolean = await bcrypt.compare(candidate, stored);
  //     return ok;
  //   }
  //   return candidate === stored;
  // }

  // /** Вернёт ХЭШ нового пароля, проверив current (если передан) и запретив совпадение со старым */
  // async newHashPassword(
  //   storedCurrent: string,
  //   newPassword: string,
  //   currentPassword?: string,
  // ): Promise<string> {
  //   if (currentPassword) {
  //     const ok = await this.comparePassword(currentPassword, storedCurrent);
  //     if (!ok) throw new Error('INVALID_CURRENT_PASSWORD');
  //   }
  //   const isSame = await this.comparePassword(newPassword, storedCurrent);
  //   if (isSame) throw new Error('SAME_AS_OLD');
  //   return await this.hashPassword(newPassword);
  // }
}
