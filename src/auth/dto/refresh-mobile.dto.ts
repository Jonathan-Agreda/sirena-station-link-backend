import { IsString, MinLength } from 'class-validator';

export class RefreshMobileDto {
  @IsString()
  @MinLength(10)
  refreshToken!: string;
}
