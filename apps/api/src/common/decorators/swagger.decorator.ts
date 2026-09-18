import { applyDecorators } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';

export function ApiDeskaAuth(tag: string) {
  return applyDecorators(ApiTags(tag), ApiCookieAuth('deska_access_token'));
}

export { ApiTags, ApiCookieAuth, ApiOperation, ApiResponse, ApiConsumes, ApiBody, ApiQuery } from '@nestjs/swagger';
