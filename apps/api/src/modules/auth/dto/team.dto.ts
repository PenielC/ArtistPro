import { UserRole } from '@prisma/client';
import { IsEmail, IsIn, IsString, IsUUID, MinLength } from 'class-validator';

/** Roles that can be given by invite or role change; Owner only ever changes hands by a transfer. */
export const ASSIGNABLE_ROLES = [
  UserRole.MANAGER,
  UserRole.STAFF,
  UserRole.FINANCE,
] as const;

export class InviteMemberDto {
  @IsEmail()
  email!: string;

  @IsIn(ASSIGNABLE_ROLES)
  role!: (typeof ASSIGNABLE_ROLES)[number];
}

export class ChangeRoleDto {
  @IsIn(ASSIGNABLE_ROLES)
  role!: (typeof ASSIGNABLE_ROLES)[number];
}

export class TransferOwnershipDto {
  @IsUUID()
  userId!: string;

  /** The current owner's password, so a borrowed session can't give the business away. */
  @IsString()
  @MinLength(1)
  password!: string;
}
