import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { InstitutionsModule } from '../institutions/institutions.module';
import { EmailVerificationToken } from '../auth/entities/email-verification-token.entity';

@Module({
  // InstitutionsModule is here so UsersService can enforce the one rule about
  // personal addresses that needs institution data: they must not be on a domain an
  // institution owns. Not a cycle — InstitutionsModule imports nothing from here.
  imports: [
    // EmailVerificationToken is registered here as well as in AuthModule: an admin
    // changing someone's main address must destroy any link issued for the old one,
    // and forFeature only provides the repository token — it does not claim ownership.
    TypeOrmModule.forFeature([User, EmailVerificationToken]),
    InstitutionsModule,
  ],
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
