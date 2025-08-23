import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

// Usamos el literal union para que class-validator funcione sin importar tipos
export class SendCommandDto {
  @IsIn(['ON', 'OFF'], { message: 'action debe ser ON u OFF' })
  action: 'ON' | 'OFF';

  @IsOptional()
  @IsInt({ message: 'ttlMs debe ser entero' })
  @Min(100, { message: 'ttlMs mínimo permitido es 100 ms' })
  ttlMs?: number;

  // Opcional por ahora: si no viene, asumimos 'manual'
  @IsOptional()
  @IsIn(['manual', 'auto'], { message: 'cause debe ser manual o auto' })
  cause?: 'manual' | 'auto';
}
