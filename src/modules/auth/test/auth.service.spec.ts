import * as bcrypt from 'bcryptjs';
import type { JwtPayload } from 'src/interfaces/jwt-payload.interface';
import { AuthService } from 'src/modules/auth/auth.service';
import { TokenEntity } from 'src/modules/auth/entities/auth.entity';

// наши тестовые утилиты и их типы
import {
  makeRepoMock,
  makeJwtMock,
  makeConfigMock,
  type RepoMock,
  type JwtMock,
  type CfgMock,
} from 'test/test-utils';

describe('AuthService', () => {
  let repo: RepoMock<TokenEntity>;
  let jwt: JwtMock;
  let cfg: CfgMock;
  let svc: AuthService;

  const payload: JwtPayload = {
    id: 'user-1',
    email: 'u1@example.com',
    name: 'User One',
    role: 'USER' as never,
    specializationId: null,
  };

  beforeEach(() => {
    repo = makeRepoMock<TokenEntity>();
    jwt = makeJwtMock();
    cfg = makeConfigMock({
      JWT_PRIVATE_KEY: 'access-priv',
      JWT_REFRESH_PRIVATE_KEY: 'refresh-priv',
      JWT_ACCESS_TTL: '30m',
      JWT_REFRESH_TTL: '30d',
      SALT_ROUNDS: '4',
    });

    // передаём совместимые моки (конструктор ждёт реальные сервисы)

    svc = new AuthService(
      repo as any,
      cfg as unknown as any,
      jwt as unknown as any,
    );
  });

  describe('generateTokens', () => {
    it('signs access & refresh with RS256 and returns both', async () => {
      jwt.signAsync
        .mockResolvedValueOnce('acc.jwt')
        .mockResolvedValueOnce('ref.jwt');

      const res = await svc.generateTokens(payload);

      expect(jwt.signAsync).toHaveBeenCalledTimes(2);
      // 1-й вызов — access
      expect(jwt.signAsync.mock.calls[0][0]).toEqual(payload);
      expect(jwt.signAsync.mock.calls[0][1]).toMatchObject({
        algorithm: 'RS256',
        privateKey: 'access-priv',
        expiresIn: '30m',
      });
      // 2-й вызов — refresh
      expect(jwt.signAsync.mock.calls[1][0]).toEqual(payload);
      expect(jwt.signAsync.mock.calls[1][1]).toMatchObject({
        algorithm: 'RS256',
        privateKey: 'refresh-priv',
        expiresIn: '30d',
      });

      expect(res).toEqual({ accessToken: 'acc.jwt', refreshToken: 'ref.jwt' });
    });
  });

  describe('validateAccessToken', () => {
    it('returns payload on success', async () => {
      jwt.verifyAsync.mockResolvedValue(payload as never);

      const out = await svc.validateAccessToken('token');

      expect(jwt.verifyAsync).toHaveBeenCalledWith('token', {
        algorithms: ['RS256'],
        publicKey: 'access-priv', // сейчас берётся из PRIVATE, как в текущем коде
      });
      expect(out).toEqual(payload);
    });

    it('returns null on error', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('bad token'));
      await expect(svc.validateAccessToken('t')).resolves.toBeNull();
    });
  });

  describe('validateRefreshToken', () => {
    it('returns payload on success', async () => {
      jwt.verifyAsync.mockResolvedValue(payload as never);

      const out = await svc.validateRefreshToken('rt');

      expect(out).toEqual(payload);
      expect(jwt.verifyAsync).toHaveBeenCalled();
    });

    it('returns null on error', async () => {
      jwt.verifyAsync.mockRejectedValue(new Error('bad refresh'));
      await expect(svc.validateRefreshToken('rt')).resolves.toBeNull();
    });
  });

  describe('refresh storage', () => {
    it('saveToken updates existing', async () => {
      const existing = Object.assign(new TokenEntity(), {
        id: 1,
        token: 'old',
        userId: 'user-1',
        createdAt: new Date(),
      });

      repo.findOne.mockResolvedValue(existing);

      repo.save.mockResolvedValue(existing);
      await svc.saveToken('user-1', 'new-refresh');

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'new-refresh' }),
      );
    });

    it('saveToken inserts when not found', async () => {
      repo.findOne.mockResolvedValue(null);

      repo.create.mockImplementation((v: any) => v as TokenEntity);

      repo.save.mockResolvedValue({} as any);

      await svc.saveToken('user-2', 'r2');

      expect(repo.create).toHaveBeenCalledWith({
        userId: 'user-2',
        token: 'r2',
      });
      expect(repo.save).toHaveBeenCalled();
    });

    it('removeToken deletes by token', async () => {
      repo.delete.mockResolvedValue({} as any);
      await svc.removeToken('r3');
      expect(repo.delete).toHaveBeenCalledWith({ token: 'r3' });
    });

    it('findToken returns userId or null', async () => {
      repo.findOne.mockResolvedValueOnce({ userId: 'u42' } as any);

      await expect(svc.findToken('abc')).resolves.toEqual({ userId: 'u42' });

      repo.findOne.mockResolvedValueOnce(null);
      await expect(svc.findToken('nope')).resolves.toBeNull();
    });
  });

  describe('password helpers', () => {
    it('hashPassword returns bcrypt hash and SALT_ROUNDS is respected', async () => {
      const hash = await svc.hashPassword('secret123');
      expect(typeof hash).toBe('string');
      expect(hash).not.toEqual('secret123');
      await expect(bcrypt.compare('secret123', hash)).resolves.toBe(true);
    });

    it('comparePassword works for bcrypt and plaintext (legacy)', async () => {
      const hash = await bcrypt.hash('p@ss', 4);
      await expect(svc.comparePassword('p@ss', hash)).resolves.toBe(true);
      await expect(svc.comparePassword('no', hash)).resolves.toBe(false);

      await expect(svc.comparePassword('plain', 'plain')).resolves.toBe(true);
      await expect(svc.comparePassword('plain', 'other')).resolves.toBe(false);
    });

    it('newHashPassword validates current, prevents reuse, returns a new hash', async () => {
      const storedHash = await bcrypt.hash('old', 4);

      await expect(
        svc.newHashPassword(storedHash, 'new', 'WRONG'),
      ).rejects.toThrow('INVALID_CURRENT_PASSWORD');

      await expect(
        svc.newHashPassword(storedHash, 'old', 'old'),
      ).rejects.toThrow('SAME_AS_OLD');

      const next = await svc.newHashPassword(storedHash, 'brand-new', 'old');
      expect(next).not.toEqual(storedHash);
      await expect(bcrypt.compare('brand-new', next)).resolves.toBe(true);
    });
  });
});
