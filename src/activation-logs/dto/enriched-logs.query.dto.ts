import { Transform } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';

export class EnrichedLogsQueryDto {
  @IsOptional()
  @IsString()
  q?: string; // búsqueda: deviceId | username | nombre

  @IsOptional()
  @IsString()
  from?: string; // ISO date

  @IsOptional()
  @IsString()
  to?: string; // ISO date

  @IsOptional()
  @IsIn(['ON', 'OFF', 'AUTO_OFF'])
  action?: 'ON' | 'OFF' | 'AUTO_OFF';

  // Si no se envía => solo ACCEPTED
  @IsOptional()
  @IsBooleanString()
  includeRejected?: 'true' | 'false';

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => Math.min(Math.max(parseInt(value, 10), 1), 200))
  @IsInt()
  @IsPositive()
  perPage?: number = 50;
}
