import { IsString, MinLength } from 'class-validator';

export class ChangePasswordWebDto {
  @IsString()
  currentPassword!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;
}
