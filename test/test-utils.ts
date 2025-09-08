// test/test-utils.ts
import type { ObjectLiteral, Repository } from 'typeorm';
import type { JwtService } from '@nestjs/jwt';

/** ---- Repo mock (только используемые методы) ---- */
export type RepoMock<T extends ObjectLiteral> = jest.Mocked<
  Pick<Repository<T>, 'findOne' | 'save' | 'delete' | 'create'>
>;

export function makeRepoMock<T extends ObjectLiteral>(): RepoMock<T> {
  const repo: Partial<Repository<T>> = {};
  repo.findOne = jest.fn() as unknown as Repository<T>['findOne'];
  repo.save = jest.fn() as unknown as Repository<T>['save'];
  repo.delete = jest.fn() as unknown as Repository<T>['delete'];
  repo.create = jest.fn() as unknown as Repository<T>['create'];
  return repo as RepoMock<T>;
}

/** ---- JwtService mock ---- */
export type JwtMock = jest.Mocked<
  Pick<JwtService, 'signAsync' | 'verifyAsync'>
>;

export function makeJwtMock(): JwtMock {
  return {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };
}

/** ---- Config mock без перегрузок (плюс доступ к внутренним jest.fn) ---- */
export type CfgMock = {
  // Типизированные функции, как вы будете их вызывать в коде
  get: <T = unknown>(key: string) => T | undefined;
  getOrThrow: <T = unknown>(key: string) => T;

  // Управление моком из тестов
  __get: jest.Mock<unknown, [key: string]>;
  __getOrThrow: jest.Mock<unknown, [key: string]>;
  set: (k: string, v: unknown) => void;
};

export function makeConfigMock(initial: Record<string, unknown> = {}): CfgMock {
  const store: Record<string, unknown> = { ...initial };

  const getMock = jest.fn((key: string) => store[key]);
  const getOrThrowMock = jest.fn((key: string) => {
    if (store[key] === undefined) throw new Error(`Missing config: ${key}`);
    return store[key]!;
  });

  // Обёртки с нормальными generic-сигнатурами — без jest.MockedFunction
  const get = (<T = unknown>(key: string): T | undefined =>
    getMock(key) as T | undefined) as CfgMock['get'];

  const getOrThrow = (<T = unknown>(key: string): T =>
    getOrThrowMock(key) as T) as CfgMock['getOrThrow'];

  const set = (k: string, v: unknown) => {
    store[k] = v;
  };

  return { get, getOrThrow, __get: getMock, __getOrThrow: getOrThrowMock, set };
}
