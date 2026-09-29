import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Institution } from './entities/institution.entity';
import { InstitutionDomain } from './entities/institution-domain.entity';
import { InstitutionInvitation } from './entities/institution-invitation.entity';
import { InstitutionsService } from './institutions.service';
import { InstitutionInvitationsService } from './institution-invitations.service';
import { InstitutionsController } from './institutions.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Institution,
      InstitutionDomain,
      InstitutionInvitation,
    ]),
  ],
  providers: [InstitutionsService, InstitutionInvitationsService],
  controllers: [InstitutionsController],
  // The invitations service is exported for the auth module, which owns the other
  // half of the flow: redeeming a link means creating an account, and that is not
  // something this module should know how to do.
  exports: [InstitutionsService, InstitutionInvitationsService],
})
export class InstitutionsModule {}
