import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(1)
  usernameOrEmail!: string;

  @IsString()
  @MinLength(3)
  password!: string;
}
