import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class PreloginDto {
  @IsString()
  usernameOrEmail!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

/**
 * Para completar el primer login (cambio de clave).
 * Usamos usernameOrEmail + currentPassword (temporal) + newPassword.
 */
export class FirstLoginPasswordDto {
  @IsString()
  usernameOrEmail!: string;

  @IsString()
  @MinLength(6)
  currentPassword!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;
}
