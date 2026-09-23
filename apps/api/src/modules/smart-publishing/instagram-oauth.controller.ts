import { Controller, Get, Post, Query, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public, RequirePermission } from '../../common/decorators/metadata.decorator';
import { TenantCtx, User } from '../../common/decorators/params.decorator';
import type { AuthUser, TenantContext } from '../../common/decorators/params.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { InstagramOAuthService } from './instagram-oauth.service';

@Controller('publishing/settings/instagram')
export class InstagramOAuthController {
  constructor(private readonly instagram: InstagramOAuthService) {}

  @Post('connect')
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @RequirePermission('publishing.settings')
  connect(@TenantCtx() tenant: TenantContext, @User() user: AuthUser) {
    return this.instagram.start(tenant.tenantId, user.id);
  }

  @Post('disconnect')
  @UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
  @RequirePermission('publishing.settings')
  disconnect(@TenantCtx() tenant: TenantContext) {
    return this.instagram.disconnect(tenant.tenantId);
  }

  @Get('callback')
  @Public()
  @SkipThrottle()
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @Res() response: Response,
  ) {
    try {
      if (error) throw new Error(errorDescription || error);
      await this.instagram.complete(String(code || ''), String(state || ''));
      response.redirect(this.instagram.webSettingsUrl({ instagram: 'connected' }));
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'ورود اینستاگرام انجام نشد';
      response.redirect(this.instagram.webSettingsUrl({ instagram: 'error', reason: message.slice(0, 180) }));
    }
  }
}
