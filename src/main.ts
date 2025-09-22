import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const cfg = app.get(ConfigService);

  // эти значения уже валидируются и имеют дефолты в Joi
  const rmqUrl = cfg.get<string>('RABBITMQ_URL', { infer: true })!;
  const queue = cfg.get<string>('RMQ_AUTH_QUEUE', { infer: true })!;
  const prefetch = Number(
    cfg.get<number>('RMQ_PREFETCH', { infer: true }) ?? 16,
  );
  const port = Number(cfg.get<number>('PORT', { infer: true }) ?? 3003);

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rmqUrl],
      queue,
      queueOptions: { durable: true },
      prefetchCount: prefetch,
      // noAck по умолчанию false — оставляем поведение с ack
    },
  });

  await app.startAllMicroservices();
  // Для /health
  await app.listen(port);

  console.log(
    `[auth] http:${port} | rmq:${rmqUrl} q:${queue} prefetch:${prefetch}`,
  );
}
void bootstrap();
