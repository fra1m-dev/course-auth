import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

import { JwtPayload } from 'src/interfaces/jwt-payload.interface';
import { TokenEntity } from './entities/auth.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(TokenEntity)
    private readonly tokens: Repository<TokenEntity>, //FIXME возможно не нужно readonly
    private readonly cfg: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  // ---------- JWT (RS256) ----------
  async generateTokens(
    user: JwtPayload, //FIXME: изменить в монолите используется обычно сузность UserEntity - тут надо подумать
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessPrivate = this.cfg.getOrThrow<string>('JWT_PRIVATE_KEY');
    const refreshPrivate = this.cfg.getOrThrow<string>(
      'JWT_REFRESH_PRIVATE_KEY',
    );
    const accessToken = await this.jwt.signAsync(user, {
      algorithm: 'RS256',
      privateKey: accessPrivate,
      expiresIn: this.cfg.get('JWT_ACCESS_TTL') ?? '30m',
    });

    const refreshToken = await this.jwt.signAsync(user, {
      algorithm: 'RS256',
      privateKey: refreshPrivate,
      expiresIn: this.cfg.get('JWT_REFRESH_TTL') ?? '30d',
    });

    return { accessToken, refreshToken };
  }

  async validateAccessToken(token: string): Promise<JwtPayload | null> {
    try {
      const pub = this.cfg.getOrThrow<string>('JWT_PRIVATE_KEY'); //FIXME: в монолите тут тотже ключ что и для accessToken - надо подумать может надо публичный
      return await this.jwt.verifyAsync<JwtPayload>(token, {
        algorithms: ['RS256'],
        publicKey: pub,
      });
    } catch {
      return null;
    }
  }

  async validateRefreshToken(token: string): Promise<JwtPayload | null> {
    try {
      const pub =
        this.cfg.get<string>('JWT_REFRESH_PRIVATE_KEY') ?? //FIXME: в монолите тут тотже ключ что и для refreshToken - надо подумать может надо публичный
        this.cfg.getOrThrow<string>('JWT_PUBLIC_KEY'); // NOTE может и не нужно
      return await this.jwt.verifyAsync<JwtPayload>(token, {
        algorithms: ['RS256'],
        publicKey: pub,
      });
    } catch {
      return null;
    }
  }

  // ---------- Refresh storage ----------
  async saveToken(userId: string, refreshToken: string): Promise<void> {
    const tokenData = await this.tokens.findOne({ where: { userId } });

    if (tokenData) {
      tokenData.token = refreshToken;
      await this.tokens.save(tokenData);
      return;
    }
    await this.tokens.save(this.tokens.create({ userId, token: refreshToken }));
  }

  async removeToken(refreshToken: string): Promise<void> {
    await this.tokens.delete({ token: refreshToken });
  }

  async findToken(refreshToken: string): Promise<{ userId: string } | null> {
    const t = await this.tokens.findOne({ where: { token: refreshToken } });
    return t ? { userId: t.userId } : null;
  }

  // ---------- Password helpers ----------
  private looksLikeBcrypt(hash?: string): boolean {
    return !!hash && hash.startsWith('$2') && hash.length > 30;
  }

  async hashPassword(password: string): Promise<string> {
    const rounds = Number(this.cfg.get('SALT_ROUNDS') ?? 10);
    const hashed: string = await bcrypt.hash(password, rounds);
    return hashed;
  }

  /** Сравнение кандидата и сохранённого пароля (поддерживает легаси-плейнтекст) */
  async comparePassword(candidate: string, stored: string): Promise<boolean> {
    if (this.looksLikeBcrypt(stored)) {
      const ok: boolean = await bcrypt.compare(candidate, stored);
      return ok;
    }
    return candidate === stored;
  }

  /** Вернёт ХЭШ нового пароля, проверив current (если передан) и запретив совпадение со старым */
  async newHashPassword(
    storedCurrent: string,
    newPassword: string,
    currentPassword?: string,
  ): Promise<string> {
    if (currentPassword) {
      const ok = await this.comparePassword(currentPassword, storedCurrent);
      if (!ok) throw new Error('INVALID_CURRENT_PASSWORD');
    }
    const isSame = await this.comparePassword(newPassword, storedCurrent);
    if (isSame) throw new Error('SAME_AS_OLD');
    return await this.hashPassword(newPassword);
  }
}
