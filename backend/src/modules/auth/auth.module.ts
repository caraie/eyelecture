import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { RefreshToken } from './entities/refresh-token.entity';
import { EmailVerificationToken } from './entities/email-verification-token.entity';
import { UsersModule } from '../users/users.module';
import { InstitutionsModule } from '../institutions/institutions.module';

@Module({
  imports: [
    UsersModule,
    InstitutionsModule,
    PassportModule,
    // Secrets are passed per-sign/verify call in AuthService and JwtStrategy,
    // so this registration stays empty on purpose.
    JwtModule.register({}),
    TypeOrmModule.forFeature([RefreshToken, EmailVerificationToken]),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
