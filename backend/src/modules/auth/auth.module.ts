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
import { LecturesModule } from '../lectures/lectures.module';

@Module({
  imports: [
    UsersModule,
    InstitutionsModule,
    // For the co-author credits waiting on an address somebody is about to
    // register with. Nothing in the lectures module reaches back here, so this
    // stays a plain one-way import.
    LecturesModule,
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
