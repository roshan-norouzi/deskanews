import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { Public } from '../../common/decorators/metadata.decorator';
import { User } from '../../common/decorators/params.decorator';
import type { AuthUser } from '../../common/decorators/params.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { MfaDisableDto, MfaEnableDto, MfaVerifyDto } from './dto/mfa.dto';
import { MfaService } from './mfa.service';
import { ApiTags, ApiOperation, ApiResponse } from '../../common/decorators/swagger.decorator';

const ACCESS_COOKIE_NAME = 'deska_access_token';
const REFRESH_COOKIE_NAME = 'deska_refresh_token';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private mfaService: MfaService,
    private config: ConfigService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @ApiOperation({ summary: 'Login with email/password; may require MFA step' })
  @ApiResponse({ status: 200, description: 'Authenticated user or MFA challenge' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(dto);
    if ('requiresMfa' in result && result.requiresMfa) {
      return { requiresMfa: true, mfaToken: result.mfaToken, user: result.user };
    }
    if (!result.tokens) {
      throw new UnauthorizedException('ورود انجام نشد');
    }
    this.setAuthCookies(response, result.tokens.accessToken, result.tokens.refreshToken);
    return {
      user: result.user,
      expiresIn: result.tokens.expiresIn,
      mfaSetupRequired: result.mfaSetupRequired ?? false,
    };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('mfa/verify')
  async verifyMfa(
    @Body() dto: MfaVerifyDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.completeMfaLogin(dto.mfaToken, dto.code);
    this.setAuthCookies(response, result.tokens.accessToken, result.tokens.refreshToken);
    return { user: result.user, expiresIn: result.tokens.expiresIn };
  }

  @UseGuards(JwtAuthGuard)
  @Get('mfa/status')
  mfaStatus(@User() user: AuthUser) {
    return this.mfaService.status(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('mfa/setup')
  mfaSetup(@User() user: AuthUser) {
    return this.mfaService.beginSetup(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('mfa/enable')
  mfaEnable(@User() user: AuthUser, @Body() dto: MfaEnableDto) {
    return this.mfaService.enable(user.id, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('mfa/disable')
  async mfaDisable(
    @User() user: AuthUser,
    @Body() dto: MfaDisableDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.mfaService.disable(user.id, dto.code, dto.password);
    this.clearAuthCookies(response);
    return result;
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  async refresh(
    @Body() dto: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = dto.refreshToken ?? this.readCookie(request, REFRESH_COOKIE_NAME);
    if (!refreshToken) {
      this.clearAuthCookies(response);
      throw new UnauthorizedException('توکن بازنشانی نامعتبر است');
    }

    try {
      const result = await this.authService.refresh({ refreshToken });
      this.setAuthCookies(response, result.tokens.accessToken, result.tokens.refreshToken);
      return { user: result.user, expiresIn: result.tokens.expiresIn };
    } catch (error) {
      this.clearAuthCookies(response);
      throw error;
    }
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('logout')
  async logout(
    @Body() dto: RefreshDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = dto.refreshToken ?? this.readCookie(request, REFRESH_COOKIE_NAME);
    this.clearAuthCookies(response);
    if (!refreshToken) return { success: true };
    return this.authService.logout({ refreshToken });
  }

  @Public()
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@User() user: AuthUser) {
    return this.authService.me(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('change-password')
  async changePassword(
    @User() user: AuthUser,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.changePassword(user.id, dto);
    this.clearAuthCookies(response);
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  async updateProfile(
    @User() user: AuthUser,
    @Body() dto: UpdateProfileDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.updateProfile(user.id, dto);
    if (result.requiresReauthentication) this.clearAuthCookies(response);
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  async logoutAll(
    @User() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.logoutAll(user.id);
    this.clearAuthCookies(response);
    return result;
  }

  private setAuthCookies(response: Response, accessToken: string, refreshToken: string) {
    response.cookie(
      ACCESS_COOKIE_NAME,
      accessToken,
      this.cookieOptions(this.durationMs('JWT_ACCESS_EXPIRES', '15m')),
    );
    response.cookie(
      REFRESH_COOKIE_NAME,
      refreshToken,
      this.cookieOptions(this.durationMs('JWT_REFRESH_EXPIRES', '7d')),
    );
  }

  private clearAuthCookies(response: Response) {
    response.clearCookie(ACCESS_COOKIE_NAME, this.cookieOptions());
    response.clearCookie(REFRESH_COOKIE_NAME, this.cookieOptions());
  }

  private cookieOptions(maxAge?: number): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/',
      ...(maxAge === undefined ? {} : { maxAge }),
    };
  }

  private durationMs(key: string, fallback: string): number {
    const duration = this.config.get<string>(key, fallback).trim();
    const match = duration.match(/^(\d+)(ms|s|m|h|d)$/);
    if (!match) return this.parseDurationMs(fallback);
    return this.parseDurationMs(duration);
  }

  private parseDurationMs(duration: string): number {
    const match = duration.match(/^(\d+)(ms|s|m|h|d)$/);
    if (!match) return 0;
    const multipliers: Record<string, number> = {
      ms: 1,
      s: 1_000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return Number.parseInt(match[1], 10) * multipliers[match[2]];
  }

  private readCookie(request: Request, name: string): string | undefined {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) return undefined;

    for (const cookie of cookieHeader.split(';')) {
      const separator = cookie.indexOf('=');
      if (separator < 0 || cookie.slice(0, separator).trim() !== name) continue;
      const value = cookie.slice(separator + 1).trim();
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }

    return undefined;
  }
}