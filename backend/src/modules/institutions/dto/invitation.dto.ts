import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { InstitutionInvitation } from '../entities/institution-invitation.entity';

export class InviteAdministratorDto {
  @ApiProperty({
    example: 'director@stanford.edu',
    description:
      'Where to send the invitation. It becomes the institutional address on the ' +
      'account, and clicking the link is what confirms they can read it.',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'That does not look like an email address' })
  @MaxLength(320)
  email!: string;
}

/** Four states, derived rather than stored — see the entity for why. */
export type InvitationState = 'pending' | 'accepted' | 'revoked' | 'expired';

export class InvitationResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty({ enum: ['pending', 'accepted', 'revoked', 'expired'] })
  state!: InvitationState;
  @ApiProperty() expiresAt!: Date;
  @ApiProperty({ nullable: true }) acceptedAt!: Date | null;
  @ApiProperty({ nullable: true }) invitedByName!: string | null;
  @ApiProperty({ nullable: true }) acceptedByName!: string | null;
  @ApiProperty() createdAt!: Date;

  static from(invitation: InstitutionInvitation): InvitationResponseDto {
    return {
      id: invitation.id,
      email: invitation.email,
      state: stateOf(invitation),
      expiresAt: invitation.expiresAt,
      acceptedAt: invitation.acceptedAt,
      invitedByName: invitation.invitedBy?.fullName ?? null,
      acceptedByName: invitation.acceptedBy?.fullName ?? null,
      createdAt: invitation.createdAt,
    };
  }
}

function stateOf(invitation: InstitutionInvitation): InvitationState {
  if (invitation.acceptedAt) return 'accepted';
  if (invitation.revokedAt) return 'revoked';
  return invitation.isExpired ? 'expired' : 'pending';
}

/**
 * What the person holding the link is shown before they fill anything in, so they
 * can see who is asking and decide. Deliberately thin: an unauthenticated caller
 * with a valid token learns the institution's name and the address it was sent to,
 * and nothing else about either.
 */
export class InvitationPreviewDto {
  @ApiProperty() institutionName!: string;
  @ApiProperty() email!: string;
  @ApiProperty() expiresAt!: Date;

  static from(invitation: InstitutionInvitation): InvitationPreviewDto {
    return {
      institutionName: invitation.institution.name,
      email: invitation.email,
      expiresAt: invitation.expiresAt,
    };
  }
}
