import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import * as fs from 'fs';
import { RequireModule, RequirePermission } from '../../common/decorators/metadata.decorator';
import { TenantCtx, User } from '../../common/decorators/params.decorator';
import type { AuthUser, TenantContext } from '../../common/decorators/params.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { DocumentsService } from './documents.service';

const SAFE_INLINE_MIME_TYPES = new Set([
  'application/pdf',
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
]);

@Controller('documents')
@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard, ModuleEnabledGuard)
@RequireModule('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get('folders')
  @RequirePermission('documents.view')
  findFolders(
    @TenantCtx() tenant: TenantContext,
    @Query('parentId') parentId?: string,
  ) {
    return this.documentsService.findFolders(tenant.tenantId, parentId);
  }

  @Post('folders')
  @RequirePermission('documents.upload')
  createFolder(
    @TenantCtx() tenant: TenantContext,
    @Body() body: { name: string; parentId?: string },
  ) {
    return this.documentsService.createFolder(tenant.tenantId, body);
  }

  @Patch('folders/:id')
  @RequirePermission('documents.upload')
  updateFolder(
    @TenantCtx() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: { name?: string; parentId?: string },
  ) {
    return this.documentsService.updateFolder(tenant.tenantId, id, body);
  }

  @Delete('folders/:id')
  @RequirePermission('documents.delete')
  removeFolder(@TenantCtx() tenant: TenantContext, @Param('id') id: string) {
    return this.documentsService.removeFolder(tenant.tenantId, id);
  }

  @Get('files')
  @RequirePermission('documents.view')
  findFiles(
    @TenantCtx() tenant: TenantContext,
    @Query('folderId') folderId?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
  ) {
    return this.documentsService.findFiles(tenant.tenantId, { folderId, entityType, entityId });
  }

  @Get('files/:id/preview')
  @RequirePermission('documents.view')
  async previewFile(
    @TenantCtx() tenant: TenantContext,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const file = await this.documentsService.getFilePath(tenant.tenantId, id);
    const canPreviewInline = SAFE_INLINE_MIME_TYPES.has(file.mimeType.toLowerCase());
    res.setHeader('Content-Type', canPreviewInline ? file.mimeType : 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
    res.setHeader('Content-Disposition', `${canPreviewInline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(file.originalName)}"`);
    fs.createReadStream(file.path).pipe(res);
  }

  @Get('files/:id/download')
  @RequirePermission('documents.view')
  async downloadFile(
    @TenantCtx() tenant: TenantContext,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const file = await this.documentsService.getFilePath(tenant.tenantId, id);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.originalName)}"`);
    fs.createReadStream(file.path).pipe(res);
  }

  @Get('files/:id')
  @RequirePermission('documents.view')
  findFile(@TenantCtx() tenant: TenantContext, @Param('id') id: string) {
    return this.documentsService.findFile(tenant.tenantId, id);
  }

  @Post('files/upload')
  @RequirePermission('documents.upload')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }))
  uploadFile(
    @TenantCtx() tenant: TenantContext,
    @User() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('folderId') folderId?: string,
    @Body('entityType') entityType?: string,
    @Body('entityId') entityId?: string,
    @Body('displayName') displayName?: string,
  ) {
    return this.documentsService.saveUploadedFile(tenant.tenantId, file, {
      folderId,
      entityType,
      entityId,
      uploadedById: user.id,
      displayName,
    });
  }

  @Patch('files/:id')
  @RequirePermission('documents.upload')
  updateFile(
    @TenantCtx() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: { originalName?: string; folderId?: string | null },
  ) {
    return this.documentsService.updateFile(tenant.tenantId, id, body);
  }

  @Patch('files/:id/attach')
  @RequirePermission('documents.upload')
  attachFile(
    @TenantCtx() tenant: TenantContext,
    @Param('id') id: string,
    @Body() body: { entityType: string; entityId: string },
  ) {
    return this.documentsService.attachToEntity(
      tenant.tenantId,
      id,
      body.entityType,
      body.entityId,
    );
  }

  @Delete('files/:id')
  @RequirePermission('documents.delete')
  removeFile(@TenantCtx() tenant: TenantContext, @Param('id') id: string) {
    return this.documentsService.removeFile(tenant.tenantId, id);
  }
}
