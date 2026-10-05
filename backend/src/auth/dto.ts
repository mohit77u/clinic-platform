import { IsIn, IsString, Length, Matches } from 'class-validator';

export class SendOtpDto {
  @IsString()
  @Matches(/^[+\d\s-]{10,16}$/, { message: 'Invalid mobile number' })
  mobile: string;

  @IsIn(['login', 'booking'])
  purpose: 'login' | 'booking' = 'login';
}

export class VerifyOtpDto {
  @IsString()
  @Matches(/^[+\d\s-]{10,16}$/, { message: 'Invalid mobile number' })
  mobile: string;

  @IsString()
  @Length(6, 6)
  code: string;

  @IsIn(['login', 'booking'])
  purpose: 'login' | 'booking' = 'login';
}
