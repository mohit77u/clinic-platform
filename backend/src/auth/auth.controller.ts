import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { CurrentUser, Public } from './auth.decorators.js';
import { ACCESS_TTL_SECONDS, AuthService, REFRESH_TTL_SECONDS } from './auth.service.js';
import type { AuthedRequest, AuthUser } from './auth.types.js';
import { SendOtpDto, VerifyOtpDto } from './dto.js';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './guards.js';
import { normalizeMobile } from './mobile.js';
import { OtpService } from './otp.service.js';

@Controller('auth')
export class AuthController {
  private readonly secure: boolean;

  constructor(
    private readonly auth: AuthService,
    private readonly otp: OtpService,
    config: ConfigService,
  ) {
    this.secure = config.get('COOKIE_SECURE') === 'true';
  }

  private setCookies(res: Response, t: { accessToken: string; refreshToken: string }) {
    const base = { httpOnly: true, secure: this.secure, sameSite: 'lax' as const };
    res.cookie(ACCESS_COOKIE, t.accessToken, { ...base, path: '/', maxAge: ACCESS_TTL_SECONDS * 1000 });
    res.cookie(REFRESH_COOKIE, t.refreshToken, { ...base, path: '/auth', maxAge: REFRESH_TTL_SECONDS * 1000 });
  }

  @Public()
  @Post('otp/send')
  @HttpCode(204)
  async send(@Body() dto: SendOtpDto, @Req() req: AuthedRequest) {
    await this.otp.send(normalizeMobile(dto.mobile), dto.purpose, req.ip ?? null);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  async verify(@Body() dto: VerifyOtpDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.auth.loginWithOtp(normalizeMobile(dto.mobile), dto.code, dto.purpose);
    this.setCookies(res, await this.auth.issueTokens(user));
    return { id: user.id, role: user.role, name: user.name, mobile: user.mobile };
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) throw new UnauthorizedException('Login required');
    const { user, ...tokens } = await this.auth.refresh(token);
    this.setCookies(res, tokens);
    return { id: user.id, role: user.role, name: user.name, mobile: user.mobile };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/auth' });
  }

  /** Soft session probe for the web app: never 401s. Renews an expired access token from the refresh cookie. */
  @Public()
  @Get('session')
  async session(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const access = req.cookies?.[ACCESS_COOKIE] as string | undefined;
    if (access) {
      try {
        return { user: await this.auth.me((await this.auth.verifyAccess(access)).id) };
      } catch {
        /* fall through to refresh */
      }
    }
    const refresh = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (refresh) {
      try {
        const { user, ...tokens } = await this.auth.refresh(refresh);
        this.setCookies(res, tokens);
        return { user: { id: user.id, role: user.role, name: user.name, mobile: user.mobile } };
      } catch {
        /* expired */
      }
    }
    return { user: null };
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }
}
