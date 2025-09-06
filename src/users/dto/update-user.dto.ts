import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { Role } from '@prisma/client';

const trim = (v: any) => (typeof v === 'string' ? v.trim() : v);
const toLower = (v: any) =>
  typeof v === 'string' ? v.trim().toLowerCase() : v;
const NAME_REGEX = /^[\p{L}\p{M}][\p{L}\p{M}'\- ]{0,58}[\p{L}\p{M}]$/u;
const USERNAME_REGEX = /^[a-z0-9._-]{3,32}$/;
const TEN_DIGITS = /^\d{10}$/;

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => trim(value))
  @Matches(USERNAME_REGEX, {
    message:
      'username inválido (usa 3-32 caracteres: a-z, 0-9, punto, guión y guión bajo)',
  })
  username?: string;

  @IsOptional()
  @IsEmail({}, { message: 'email inválido' })
  @Transform(({ value }) => toLower(value))
  email?: string;

  @IsOptional()
  @IsEnum(Role, { message: 'role inválido' })
  role?: Role;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trim(value))
  @Length(2, 60)
  @Matches(NAME_REGEX, {
    message:
      "firstName inválido (solo letras, espacios, ', -; 2-60 caracteres)",
  })
  firstName?: string | null;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trim(value))
  @Length(2, 60)
  @Matches(NAME_REGEX, {
    message: "lastName inválido (solo letras, espacios, ', -; 2-60 caracteres)",
  })
  lastName?: string | null;

  @IsOptional()
  @IsString()
  @Matches(TEN_DIGITS, { message: 'cedula debe tener 10 dígitos' })
  cedula?: string | null;

  @IsOptional()
  @IsString()
  @Matches(TEN_DIGITS, { message: 'celular debe tener 10 dígitos' })
  celular?: string | null;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trim(value))
  @MaxLength(30)
  etapa?: string | null;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trim(value))
  @MaxLength(30)
  manzana?: string | null;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trim(value))
  @MaxLength(30)
  villa?: string | null;

  @IsOptional()
  @IsBoolean()
  alicuota?: boolean;

  @IsOptional()
  @IsString()
  urbanizationId?: string;

  @IsOptional()
  sessionLimit?: number | null; // se filtra en service para SUPERADMIN
}
