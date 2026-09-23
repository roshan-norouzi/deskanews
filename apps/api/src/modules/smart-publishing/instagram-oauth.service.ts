import { BadRequestException, Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PublishingSettingsService } from './publishing-settings.service';

const GRAPH_VERSION = 'v21.0';
const SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
].join(',');

type OAuthState = { tenantId: string; userId: string; exp: number };

@Injectable()
export class InstagramOAuthService {
  constructor(private readonly settings: PublishingSettingsService) {}

  oauthAvailable(): boolean {
    const { appId, appSecret } = this.appCredentials();
    return Boolean(appId && appSecret);
  }

  async start(tenantId: string, userId: string): Promise<{ url: string }> {
    const { appId, appSecret } = this.appCredentials();
    if (!appId || !appSecret) {
      throw new BadRequestException('ورود اینستاگرام روی این سرور پیکربندی نشده است. INSTAGRAM_APP_ID و INSTAGRAM_APP_SECRET را در محیط اجرا تنظیم کنید.');
    }
    const state = this.signState({ tenantId, userId, exp: Date.now() + 10 * 60_000 });
    const params = new URLSearchParams({
      client_id: appId,
      redirect_uri: this.redirectUri(),
      state,
      response_type: 'code',
      scope: SCOPES,
    });
    return { url: `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params}` };
  }

  async complete(code: string, state: string) {
    const payload = this.readState(state);
    const shortLived = await this.exchangeCode(code);
    const longLived = await this.exchangeLongLived(shortLived.access_token);
    const account = await this.resolveInstagramAccount(longLived.access_token);
    await this.settings.save(payload.tenantId, {
      social_instagram_access_token: account.accessToken,
      social_instagram_account_id: account.accountId,
      social_instagram_username: account.username,
      social_instagram_api_version: GRAPH_VERSION,
    });
    return { tenantId: payload.tenantId, username: account.username };
  }

  async disconnect(tenantId: string) {
    return this.settings.save(tenantId, {
      social_instagram_access_token: '',
      social_instagram_account_id: '',
      social_instagram_username: '',
    }, ['social_instagram_access_token']);
  }

  webSettingsUrl(query: Record<string, string>): string {
    const params = new URLSearchParams({ tab: 'social', sub: 'networks', ...query });
    return `${this.webOrigin()}/publishing/settings?${params}`;
  }

  private appCredentials() {
    return {
      appId: String(process.env.INSTAGRAM_APP_ID || process.env.FACEBOOK_APP_ID || '').trim(),
      appSecret: String(process.env.INSTAGRAM_APP_SECRET || process.env.FACEBOOK_APP_SECRET || '').trim(),
    };
  }

  private webOrigin(): string {
    const origin = String(process.env.PUBLIC_APP_URL || process.env.PUBLIC_URL || process.env.CORS_ORIGIN || '')
      .split(',')[0]
      .trim()
      .replace(/\/$/u, '');
    if (!origin) throw new BadRequestException('آدرس عمومی برنامه (CORS_ORIGIN) تنظیم نشده است');
    const base = String(process.env.BASE_PATH || process.env.NEXT_PUBLIC_BASE_PATH || '').replace(/^\/+|\/+$/gu, '');
    return base ? `${origin}/${base}` : origin;
  }

  private redirectUri(): string {
    return `${this.webOrigin()}/api/publishing/settings/instagram/callback`;
  }

  private signState(payload: OAuthState): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = createHmac('sha256', this.stateSecret()).update(body).digest('base64url');
    return `${body}.${sig}`;
  }

  private readState(state: string): OAuthState {
    const [body, sig] = String(state || '').split('.');
    if (!body || !sig) throw new BadRequestException('نشست ورود اینستاگرام نامعتبر است');
    const expected = createHmac('sha256', this.stateSecret()).update(body).digest('base64url');
    const actual = Buffer.from(sig);
    const wanted = Buffer.from(expected);
    if (actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) {
      throw new BadRequestException('نشست ورود اینستاگرام نامعتبر است');
    }
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as OAuthState;
    if (!payload?.tenantId || !payload.userId || payload.exp < Date.now()) {
      throw new BadRequestException('مهلت ورود اینستاگرام تمام شده است؛ دوباره تلاش کنید');
    }
    return payload;
  }

  private stateSecret(): string {
    const secret = String(process.env.JWT_SECRET || '').trim();
    if (secret.length < 16) throw new BadRequestException('JWT_SECRET برای ورود اینستاگرام کافی نیست');
    return secret;
  }

  private async exchangeCode(code: string): Promise<{ access_token: string }> {
    const { appId, appSecret } = this.appCredentials();
    const params = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: this.redirectUri(),
      code,
    });
    return this.graphJson(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${params}`);
  }

  private async exchangeLongLived(token: string): Promise<{ access_token: string }> {
    const { appId, appSecret } = this.appCredentials();
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: token,
    });
    try {
      return await this.graphJson(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token?${params}`);
    } catch {
      return { access_token: token };
    }
  }

  private async resolveInstagramAccount(userToken: string): Promise<{ accountId: string; username: string; accessToken: string }> {
    const query = new URLSearchParams({
      fields: 'id,name,access_token,instagram_business_account{id,username}',
      access_token: userToken,
    });
    const pages = await this.graphJson<{ data?: Array<{
      access_token?: string;
      instagram_business_account?: { id?: string; username?: string };
    }> }>(`https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?${query}`);
    const page = (pages.data || []).find((item) => item.instagram_business_account?.id);
    const ig = page?.instagram_business_account;
    if (!ig?.id) {
      throw new BadRequestException('حساب اینستاگرام Business/Creator متصل به صفحه فیسبوک پیدا نشد. حساب را Professional کنید و به یک صفحه وصل کنید.');
    }
    return {
      accountId: ig.id,
      username: ig.username || ig.id,
      accessToken: page?.access_token || userToken,
    };
  }

  private async graphJson<T = { access_token: string }>(url: string): Promise<T> {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    const body = await response.json() as T & { error?: { message?: string } };
    if (!response.ok || body.error) {
      throw new BadRequestException(body.error?.message || `ورود اینستاگرام با خطای HTTP ${response.status} ناموفق بود`);
    }
    return body;
  }
}
