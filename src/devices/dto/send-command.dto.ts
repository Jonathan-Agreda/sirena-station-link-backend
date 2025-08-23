import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class SendCommandDto {
  @IsIn(['ON', 'OFF'], { message: 'action debe ser ON u OFF' })
  action: 'ON' | 'OFF';

  /**
   * Tiempo de vida en milisegundos.
   * - Si se omite → se usa DEFAULT_CMD_TTL_MS de .env
   * - Si se manda 0 → también se usa DEFAULT_CMD_TTL_MS
   */
  @IsOptional()
  @IsInt({ message: 'ttlMs debe ser entero' })
  @Min(0, { message: 'ttlMs no puede ser negativo' })
  ttlMs?: number;

  // Causa opcional (manual | auto)
  @IsOptional()
  @IsIn(['manual', 'auto'], { message: 'cause debe ser manual o auto' })
  cause?: 'manual' | 'auto';
}
