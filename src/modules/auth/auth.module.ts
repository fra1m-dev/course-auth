import * as fs from 'fs';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TokenEntity } from './entities/auth.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

function readKey(
  cfg: ConfigService,
  envPath: string,
  envInline: string,
  envBase64: string,
) {
  const p = cfg.get<string>(envPath);
  if (p && fs.existsSync(p)) return fs.readFileSync(p, 'utf8');

  const b64 = cfg.get<string>(envBase64);
  if (b64) return Buffer.from(b64, 'base64').toString('utf8');

  const inline = cfg.get<string>(envInline);
  if (inline) return inline.replace(/\\n/g, '\n'); // на случай \n в .env

  throw new Error(`Missing key: ${envPath} | ${envInline} | ${envBase64}`);
}

@Module({
  imports: [
    TypeOrmModule.forFeature([TokenEntity]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const privateKey = readKey(
          cfg,
          'JWT_PRIVATE_KEY_PATH',
          'JWT_PRIVATE_KEY',
          'JWT_PRIVATE_KEY_B64',
        );
        const publicKey = readKey(
          cfg,
          'JWT_PUBLIC_KEY_PATH',
          'JWT_PUBLIC_KEY',
          'JWT_PUBLIC_KEY_B64',
        );

        const refreshPrivateKey = readKey(
          cfg,
          'JWT_REFRESH_PRIVATE_KEY_PATH',
          'JWT_REFRESH_PRIVATE_KEY',
          'JWT_REFRESH_PRIVATE_KEY_B64',
        );
        const refreshPublicKey = readKey(
          cfg,
          'JWT_REFRESH_PUBLIC_KEY_PATH',
          'JWT_REFRESH_PUBLIC_KEY',
          'JWT_REFRESH_PUBLIC_KEY_B64',
        );

        return {
          privateKey, // используется JwtService по умолчанию
          publicKey,
          signOptions: { algorithm: 'RS256' },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}

// AuthLibModule.forRoot({
//   secret: process.env.JWT_ACCESS_SECRET || 'secret',
// }), //TODO надо раскомитить и проверить как оно будет работать
