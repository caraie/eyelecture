import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { LectureCoAuthor } from '../entities/lecture-co-author.entity';
import { User } from '../../users/entities/user.entity';

export class AddCoAuthorDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  userId!: string;
}

export class InviteCoAuthorDto {
  @ApiProperty({ example: 'dave@montefiore.org' })
  @IsEmail()
  @MaxLength(320)
  @Transform(({ value }) => String(value ?? '').trim().toLowerCase())
  email!: string;

  @ApiPropertyOptional({ example: 'Dave Rosenberg' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => String(value ?? '').replace(/\s+/g, ' ').trim())
  name?: string;
}

export class SearchPeopleDto {
  @ApiProperty({ example: 'rosen' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q!: string;
}

/** A person to pick from. No address comes back — see the service. */
export class PersonDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) institutionName!: string | null;
  @ApiProperty({ nullable: true }) role!: string | null;

  static from(user: User): PersonDto {
    return {
      id: user.id,
      name: `${user.firstName} ${user.lastName}`.trim(),
      institutionName: user.institution?.name ?? null,
      role: user.role ?? null,
    };
  }
}

export class CoAuthorDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true }) userId!: string | null;
  @ApiProperty() name!: string;
  @ApiProperty({ nullable: true }) institutionName!: string | null;
  @ApiProperty({ description: 'True while they have only been written to' })
  invited!: boolean;
  @ApiProperty({ description: 'The invitation ran out before anyone used it' })
  expired!: boolean;

  static from(row: LectureCoAuthor): CoAuthorDto {
    const user = row.user;
    const pendingInvitation = row.userId === null;
    return {
      id: row.id,
      userId: row.userId,
      // Their account's name once there is one; otherwise whatever the author
      // typed, and failing that the address — a chip has to say somebody.
      name: user
        ? `${user.firstName} ${user.lastName}`.trim()
        : (row.invitedName ?? row.email ?? 'Invited'),
      institutionName: user?.institution?.name ?? null,
      invited: pendingInvitation,
      expired:
        pendingInvitation &&
        row.expiresAt !== null &&
        row.expiresAt.getTime() <= Date.now(),
    };
  }
}
