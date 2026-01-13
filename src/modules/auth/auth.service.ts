//TODO: Сделать логику обновления токена после создания едпоинта авторизации
import * as fs from 'fs';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TokenEntity } from './entities/auth.entity';
import { IssuedTokens } from 'src/contracts/auth.patterns';
import { Role, UserModel } from 'src/common/models/user-model';
import { string } from 'joi';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(TokenEntity)
    private readonly tokens: Repository<TokenEntity>,
    private readonly cfg: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  private readKey(
    envPath: string,
    envInline: string,
    envBase64: string,
  ): string {
    const p = this.cfg.get<string>(envPath);
    if (p && fs.existsSync(p)) return fs.readFileSync(p, 'utf8');

    const b64 = this.cfg.get<string>(envBase64);
    if (b64) return Buffer.from(b64, 'base64').toString('utf8');

    const inline = this.cfg.get<string>(envInline);
    if (inline) return inline.replace(/\\n/g, '\n');

    throw new UnauthorizedException(
      `Missing key: ${envPath} | ${envInline} | ${envBase64}`,
    );
  }

  private getAccessPublicKey(): string {
    return this.readKey(
      'JWT_PUBLIC_KEY_PATH',
      'JWT_PUBLIC_KEY',
      'JWT_PUBLIC_KEY_B64',
    );
  }

  private getRefreshPublicKey(): string {
    return this.readKey(
      'JWT_REFRESH_PUBLIC_KEY_PATH',
      'JWT_REFRESH_PUBLIC_KEY',
      'JWT_REFRESH_PUBLIC_KEY_B64',
    );
  }

  private extractUserId(payload: unknown): number {
    const sub = (payload as { sub?: string | number })?.sub;
    const userId =
      typeof sub === 'string'
        ? Number(sub)
        : typeof sub === 'number'
          ? sub
          : NaN;
    if (!Number.isFinite(userId)) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return userId;
  }

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

  private async getTokenByUserId(id: number) {
    const row = await this.tokens.findOne({ where: { userId: id } });
    return row?.token || null;
  }

  private async verifyRefreshToken(token: string): Promise<number> {
    if (!token) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const refreshPublic = this.getRefreshPublicKey();
    const payload = await this.jwt.verifyAsync(token, {
      algorithms: ['RS256'],
      publicKey: refreshPublic,
    });

    const userId = this.extractUserId(payload);
    const row = await this.tokens.findOne({ where: { userId } });
    if (!row?.token) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const pepper = this.cfg.get<string>('TOKEN_PEPPER') ?? 'TOKEN_PEPPER';
    const peppered = this.hmacPepper(token, pepper);
    const ok = await bcrypt.compare(peppered, row.token);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return userId;
  }

  async removeToken(refreshToken: string): Promise<void> {
    const userId = await this.verifyRefreshToken(refreshToken);
    await this.tokens.update({ userId }, { token: null });
  }

  async validateRefreshToken(data: {
    token: string;
  }): Promise<{ userId: number | null }> {
    try {
      const userId = await this.verifyRefreshToken(data.token);
      return { userId };
    } catch (e) {
      throw new UnauthorizedException(e.message);
    }
  }

  async validateAccessToken(data: {
    token: string;
  }): Promise<{ userId: number }> {
    try {
      if (!data.token) {
        throw new UnauthorizedException('Invalid credentials');
      }
      const accessPublic = this.getAccessPublicKey();
      const payload = await this.jwt.verifyAsync(data.token, {
        algorithms: ['RS256'],
        publicKey: accessPublic,
      });
      const userId = this.extractUserId(payload);
      return { userId };
    } catch (e) {
      throw new UnauthorizedException(e.message);
    }
  }

  private async verifyPassword(
    userId: number,
    password: string,
  ): Promise<boolean> {
    const row = await this.tokens.findOne({ where: { userId } });
    if (!row?.passwordHash) return false;
    return bcrypt.compare(password, row.passwordHash);
  }
  // ---------- JWT (RS256) ----------
  /**
   * Выдать пару токенов и сохранить refresh для userId
   */
  async generateTokens(
    user: UserModel,
    password?: string,
  ): Promise<IssuedTokens> {
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
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        specializationId: user.specializationId,
      },
      {
        algorithm: 'RS256',
        privateKey: accessPrivate,
        expiresIn: accessTtlSec,
        jwtid: accessJti,
      },
    );

    const refreshToken = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        specializationId: user.specializationId,
      },
      {
        algorithm: 'RS256',
        privateKey: refreshPrivate,
        expiresIn: refreshTtlSec,
        jwtid: refreshJti,
      },
    );

    // (как у тебя) сохраняем ХЕШ «перчёного» refresh в БД, но НЕ сам токен
    const pepper = this.cfg.get<string>('TOKEN_PEPPER') ?? 'TOKEN_PEPPER';
    const peppered = this.hmacPepper(refreshToken, pepper);
    // TODO: 12 - это slat_rounds. Нужно добавить в env
    const refreshHash = await this.generateHash(peppered);

    let passwordHash;
    if (password) {
      passwordHash = await this.generateHash(password);
    }

    await this.tokens.upsert(
      password
        ? { userId: user.id, token: refreshHash, passwordHash }
        : { userId: user.id, token: refreshHash },
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
    const passwordHash = await this.generateHash(password);
    console.log('Password hash created:', passwordHash);
    // // Ищем запись по userId — либо создаём новую
    // const existing = await this.tokens.findOne({ where: { userId } });
    // if (existing) {
    //   existing.passwordHash = passwordHash;
    //   await this.tokens.save(existing);
    //   return;
    // }

    const row = this.tokens.create({
      userId,
      passwordHash,
      token: null, // refresh проставим при выдаче токенов
    });

    // console.log('Creating token entity:', row);
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

  async generateHash(res: string): Promise<string> {
    const rounds = Number(this.cfg.get('SALT_ROUNDS') ?? 12);
    const hashed: string = await bcrypt.hash(res, rounds);
    return hashed;
  }

  /** Логин: проверить пароль по userId и выдать токены по переданному снэпшоту user */
  async loginByPassword(params: {
    user: UserModel;
    password: string;
  }): Promise<IssuedTokens> {
    const ok = await this.verifyPassword(params.user.id, params.password);

    // (опционально) имитация одинакового времени ответа
    // await new Promise(r => setTimeout(r, 100));

    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return await this.generateTokens(params.user);
  }
}

// TODO: Сделать логику смены пароля (скопированно из микр. users) - после создания ендпоинта авторизации
// async changePasswordUser(
//   updateUserDto: ResetPasswordDto,
//   userJwtf: JwtPayload,
// ) {
//   const user = await this.getUserByEmail(userJwtf.email);

//   if (!user) throw new NotFoundException('Пользователь не найден');

//   const newPassword = await this.authService.newgenerateHash(
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

// // ---------- Refresh storage ----------
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
// async newgenerateHash(
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
//   return await this.generateHash(newPassword);
// }
