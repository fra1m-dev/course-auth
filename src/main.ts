import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const cfg = app.get(ConfigService);
  const rmqUrl = cfg.getOrThrow<string>('RMQ_URL');
  const queue = cfg.get<string>('AUTH_QUEUE') ?? 'auth';

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [rmqUrl],
      queue,
      queueOptions: { durable: true },
      prefetchCount: 16,
    },
  });

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 3001);

  console.log(`Analytics HTTP on :${process.env.PORT ?? 3001}`);
}
void bootstrap();
