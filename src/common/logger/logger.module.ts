import { Global, Module } from '@nestjs/common';
import { LoggerModule as PinoModule } from 'nestjs-pino';

function parseBool(v?: string) {
  return String(v).toLowerCase() === 'true';
}

@Global()
@Module({
  imports: [
    PinoModule.forRoot({
      pinoHttp: {
        // редактирование чувствительных полей
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.body.password',
            'req.body.refreshToken',
            'res.headers["set-cookie"]',
          ],
          censor: '[REDACTED]',
        },
        // добавим служебные поля в каждый лог
        autoLogging: true,
        customProps: (req) => ({
          service: process.env.SERVICE_NAME || 'app',
          version: process.env.SERVICE_VERSION || '0.0.0',
          env: process.env.NODE_ENV || 'development',
          requestId: req?.headers?.['x-request-id'],
        }),
        // уровень логирования
        level: process.env.LOG_LEVEL || 'info',
        // pretty в dev
        transport: parseBool(process.env.LOG_PRETTY)
          ? {
              target: 'pino-pretty',
              options: {
                colorize: true,
                singleLine: false,
                translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l o',
                messageFormat:
                  '{service}/{env} {requestId} {req.method} {req.url} -> {res.statusCode} {responseTime}ms {msg}',
              },
            }
          : undefined,
        // что писать в лог на каждый HTTP запрос
        serializers: {
          req(req) {
            return {
              method: req.method,
              url: req.url,
              ip: req.ip,
              headers: {
                'user-agent': req.headers['user-agent'],
                'x-request-id': req.headers['x-request-id'],
              },
              // тело лучше не логировать целиком; можно частично
              body:
                req.raw?.body && process.env.NODE_ENV === 'development'
                  ? req.raw.body
                  : undefined,
            };
          },
          res(res) {
            return {
              statusCode: res.statusCode,
            };
          },
        },
      },
    }),
  ],
  exports: [PinoModule],
})
export class LoggerModule {}
