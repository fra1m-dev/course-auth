import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { Logger } from 'nestjs-pino';

function toError(e: unknown): Error {
  if (e instanceof Error) return e;
  if (typeof e === 'string') return new Error(e);
  if (typeof e === 'object' && e && 'message' in e) {
    return new Error(String((e as { message: unknown }).message));
  }
  try {
    return new Error(JSON.stringify(e));
  } catch {
    return new Error(String(e));
  }
}

@Injectable()
export class RmqLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: Logger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    // для RMQ контекст — 'rpc'
    const ctx = context.switchToRpc();
    const pattern = ctx.getContext()?.getPattern?.() ?? 'unknown';
    const data = ctx.getData?.() ?? {};
    const started = Date.now();

    this.logger.debug(
      { pattern, payload: data?.meta ? { meta: data.meta } : undefined },
      'RMQ request received',
    );

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - started;
        this.logger.debug(
          { pattern, duration_ms: duration },
          'RMQ request done',
        );
      }),
      catchError((err) => {
        const duration = Date.now() - started;
        this.logger.error(
          { pattern, duration_ms: duration, error: err?.message },
          'RMQ request failed',
        );
        const error = toError(err);
        return throwError(() => error);
      }),
    );
  }
}
