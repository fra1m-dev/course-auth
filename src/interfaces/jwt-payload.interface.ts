export interface JwtPayload {
  id: string; // строка — удобно для микросервисов
  email: string;
  name: string;
  role: string | string[];
  specializationId: number | null;
  iat?: number;
  exp?: number;
}
