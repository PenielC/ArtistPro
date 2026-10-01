import { IsEmail, IsString, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(10)
  token!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class VerifyEmailDto {
  @IsString()
  @MinLength(10)
  token!: string;
}

export class AcceptInvitationDto {
  @IsString()
  @MinLength(10)
  token!: string;

  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}
