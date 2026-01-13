export const AUTH_PATTERNS = {
  GENERATE_TOKENS: 'auth.generateTokens',
  VALIDATE_ACCESS: 'auth.validateAccess',
  VALIDATE_REFRESH: 'auth.validateRefresh',

  CREATE_CREDENTIALS: 'auth.createCredentials',
  AUTH_BY_PASSWORD: 'auth.authByPassword',

  SAVE_TOKEN: 'auth.saveToken',
  REMOVE_TOKEN: 'auth.removeToken',
  FIND_TOKEN: 'auth.findToken',

  HASH_PASSWORD: 'auth.hashPassword',
  COMPARE_PASSWORD: 'auth.comparePassword',
  NEW_HASH_PASSWORD: 'auth.newHashPassword',
} as const;

export type IssuedTokens = {
  accessToken: string;
  refreshToken: string;
  accessJti: string;
  refreshJti: string;
  accessTtlSec: number;
  refreshTtlSec: number;
};

export type AuthPattern = (typeof AUTH_PATTERNS)[keyof typeof AUTH_PATTERNS];
