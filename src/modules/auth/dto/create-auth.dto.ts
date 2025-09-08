import { IsEmail, IsString, Length } from 'class-validator';

export class AuthUserDto {
  @IsString()
  @IsEmail()
  email!: string;

  @IsString()
  @Length(6, 16)
  password!: string;
}
