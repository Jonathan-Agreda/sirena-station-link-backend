import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshMobileDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
