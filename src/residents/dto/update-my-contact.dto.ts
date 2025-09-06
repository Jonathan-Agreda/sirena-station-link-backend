import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  ValidateIf,
} from 'class-validator';

export class UpdateMyContactDto {
  @IsOptional()
  @IsEmail({}, { message: 'Email no válido' })
  @MaxLength(120)
  email?: string;

  // Valida 10 dígitos sólo si viene como string (permitimos null para limpiar)
  @IsOptional()
  @ValidateIf((o) => typeof o.cedula === 'string')
  @IsString()
  @Matches(/^\d{10}$/, { message: 'La cédula debe tener 10 dígitos' })
  cedula?: string | null;

  @IsOptional()
  @ValidateIf((o) => typeof o.celular === 'string')
  @IsString()
  @Matches(/^\d{10}$/, { message: 'El celular debe tener 10 dígitos' })
  celular?: string | null;
}
