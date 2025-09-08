import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',

  // ищем тесты только в src
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],

  // трансформим TypeScript -> JS через ts-jest
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.json',
        // если захочешь тише — поставь false
        diagnostics: true,
      },
    ],
  },

  // чтобы работали импорты вида "src/..." (если ты их используешь)
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1',
    '^test/(.*)$': '<rootDir>/test/$1',
  },

  // покрытие по желанию — не ломает CI
  collectCoverageFrom: [
    'src/**/*.{ts,js}',
    '!src/main.ts',
    '!src/**/*.module.ts',
  ],
  coverageDirectory: '<rootDir>/coverage',

  // чтобы мокки не «утекали» между тестами
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};

export default config;
