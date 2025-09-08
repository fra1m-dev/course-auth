export const AUTH_PATTERNS = {
  GENERATE_TOKENS: 'auth.generateTokens',
  VALIDATE_ACCESS: 'auth.validateAccess',
  VALIDATE_REFRESH: 'auth.validateRefresh',

  SAVE_TOKEN: 'auth.saveToken',
  REMOVE_TOKEN: 'auth.removeToken',
  FIND_TOKEN: 'auth.findToken',

  HASH_PASSWORD: 'auth.hashPassword',
  COMPARE_PASSWORD: 'auth.comparePassword',
  NEW_HASH_PASSWORD: 'auth.newHashPassword',
} as const;

export type AuthPattern = (typeof AUTH_PATTERNS)[keyof typeof AUTH_PATTERNS];
