import { IsEmail, IsString, Length } from 'class-validator';

export class AuthUserDto {
  @IsString()
  @IsEmail()
  email!: string;

  @IsString({ message: 'Должно быть строкой' })
  @Length(6, 16, {
    message: 'Длинна пароля должна быть не меньше 6 и не больше 16',
  })
  password!: string;
}
