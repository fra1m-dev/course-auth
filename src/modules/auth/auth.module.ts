import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
// import { JwtAuthGuard } from 'src/guards/jwt-auth.guard';
// import { RolesGuard } from 'src/guards/role.guard';
import { TokenEntity } from './entities/auth.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
// import { AuthLibModule } from '@fra1m-dev/contracts-auth';

@Module({
  imports: [
    TypeOrmModule.forFeature([TokenEntity]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        // по умолчанию JwtService будет знать ключи и алгоритм,
        // но в сервисе мы всё равно явно передаём при sign/verify
        publicKey: cfg.get<string>('JWT_PUBLIC_KEY'),
        privateKey: cfg.get<string>('JWT_PRIVATE_KEY'),
        signOptions: { algorithm: 'RS256' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}

// AuthLibModule.forRoot({
//   secret: process.env.JWT_ACCESS_SECRET || 'secret',
// }), //TODO надо раскомитить и проверить как оно будет работать
