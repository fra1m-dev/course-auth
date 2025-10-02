//TODO: Сделать логику обновления токена после создания едпоинта авторизации
import * as fs from 'fs';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TokenEntity } from './entities/auth.entity';
import { Role } from '@fra1m-dev/contracts-auth';
import { IssuedTokens } from 'src/contracts/auth.patterns';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(TokenEntity)
    private readonly tokens: Repository<TokenEntity>,
    private readonly cfg: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  private hmacPepper(value: string, pepper: string): string {
    return crypto.createHmac('sha256', pepper).update(value).digest('hex');
  }

  private parseTtlToSeconds(raw: string | number): number {
    if (typeof raw === 'number') return raw;
    const m = String(raw)
      .trim()
      .match(/^(\d+)\s*([smhd])?$/i);
    if (!m) return Number(raw) || 0;
    const n = Number(m[1]);
    const unit = (m[2] || 's').toLowerCase();
    const mult =
      unit === 'm' ? 60 : unit === 'h' ? 3600 : unit === 'd' ? 86400 : 1;
    return n * mult;
  }
  // ---------- JWT (RS256) ----------
  /**
   * Выдать пару токенов и сохранить refresh для userId
   */
  async generateTokens(user: {
    id: number;
    email: string;
    name: string;
    role: Role;
  }): Promise<IssuedTokens> {
    const accessTtlRaw = this.cfg.get('JWT_ACCESS_TTL') ?? '30m';
    const refreshTtlRaw = this.cfg.get('JWT_REFRESH_TTL') ?? '30d';
    const accessTtlSec = this.parseTtlToSeconds(accessTtlRaw);
    const refreshTtlSec = this.parseTtlToSeconds(refreshTtlRaw);

    const accessJti = crypto.randomUUID();
    const refreshJti = crypto.randomUUID();

    const accessPrivate = this.cfg.get<string>('JWT_PRIVATE_KEY_PATH')
      ? fs.readFileSync(this.cfg.get<string>('JWT_PRIVATE_KEY_PATH')!, 'utf8')
      : (this.cfg.get<string>('JWT_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n');

    const refreshPrivate = this.cfg.get<string>('JWT_REFRESH_PRIVATE_KEY_PATH')
      ? fs.readFileSync(
          this.cfg.get<string>('JWT_REFRESH_PRIVATE_KEY_PATH')!,
          'utf8',
        )
      : (this.cfg.get<string>('JWT_REFRESH_PRIVATE_KEY') ?? '').replace(
          /\\n/g,
          '\n',
        );

    // ВАЖНО: прокинуть jti в оба токена (и, при желании, deviceId/ua)
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, name: user.name, role: user.role },
      {
        algorithm: 'RS256',
        privateKey: accessPrivate,
        expiresIn: accessTtlSec,
        jwtid: accessJti,
      },
    );

    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, email: user.email, name: user.name, role: user.role },
      {
        algorithm: 'RS256',
        privateKey: refreshPrivate,
        expiresIn: refreshTtlSec,
        jwtid: refreshJti,
      },
    );

    // (как у тебя) сохраняем ХЕШ «перчёного» refresh в БД, но НЕ сам токен
    const pepper = 'TOKEN_PEPPER';
    const peppered = this.hmacPepper(refreshToken, pepper);
    // TODO: 12 - это slat_rounds. Нужно добавить в env
    const refreshHash = await bcrypt.hash(peppered, 12);
    await this.tokens.upsert(
      { userId: user.id, token: refreshHash },
      { conflictPaths: ['userId'], skipUpdateIfNoValuesChanged: true },
    );

    return {
      accessToken,
      refreshToken,
      accessJti,
      refreshJti,
      accessTtlSec,
      refreshTtlSec,
    };
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
