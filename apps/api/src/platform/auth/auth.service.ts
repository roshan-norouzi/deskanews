import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomUUID } from 'crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PrismaService } from '../../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { normalizeDigits, normalizeEmployeeProfile, pickProvidedProfileFields, type EmployeeProfileInput } from '@deska/shared';
import { Prisma } from '@prisma/client';
import { UpdateEmployeeProfileDto } from './dto/update-employee-profile.dto';
import {
  applyEmployeeProfileToUpdate,
  assertUniqueNationalId,
  assertValidEmployeeProfile,
} from '../tenant/employee-profile.helper';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const now = new Date();
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });

    if (!user?.isActive || user.status !== 'active' || (user.lockedUntil && user.lockedUntil > now)) {
      throw new UnauthorizedException('ایمیل یا رمز عبور نادرست است');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      await this.prisma.$transaction(async (tx) => {
        const failedLogin = await tx.user.update({
          where: { id: user.id },
          data: { failedLoginAttempts: { increment: 1 } },
          select: { failedLoginAttempts: true },
        });

        if (failedLogin.failedLoginAttempts >= 5) {
          await tx.user.update({
            where: { id: user.id },
            data: { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) },
          });
        }
      });
      throw new UnauthorizedException('ایمیل یا رمز عبور نادرست است');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now },
    });

    const tokens = await this.issueTokens(user.id, user.email, user.role);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
      ...tokens,
    };
  }

  async registerUser(data: { email: string; name: string; password: string; phone?: string }) {
    const email = data.email.trim().toLowerCase();
    const phone = data.phone?.trim() ? this.normalizePhone(data.phone) : undefined;
    const phoneVariants = phone ? this.phoneVariants(phone) : [];

    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email }, ...(phoneVariants.length ? [{ phone: { in: phoneVariants } }] : [])] },
    });
    if (existing) {
      throw new ConflictException('این ایمیل یا شماره موبایل قبلاً ثبت شده است');
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    return this.prisma.user.create({
      data: {
        email,
        phone,
        passwordHash,
        name: data.name.trim(),
        status: 'active',
      },
    });
  }

  async refresh(dto: { refreshToken: string }) {
    const tokenHash = this.hashRefreshToken(dto.refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: tokenHash },
      include: { user: true },
    }) ?? await this.prisma.refreshToken.findUnique({
      // Compatibility with refresh tokens issued before token hashing was enabled.
      where: { token: dto.refreshToken },
      include: { user: true },
    });

    if (!stored) {
      throw new UnauthorizedException('توکن بازنشانی نامعتبر است');
    }

    const now = new Date();
    if (stored.expiresAt < now) {
      await this.prisma.refreshToken.deleteMany({ where: { id: stored.id } });
      throw new UnauthorizedException('توکن بازنشانی منقضی شده است');
    }

    if (!stored.user.isActive || stored.user.status !== 'active') {
      throw new UnauthorizedException('حساب کاربری غیرفعال است');
    }

    const tokenPair = this.createTokenPair(
      stored.user.id,
      stored.user.email,
      stored.user.role,
    );

    await this.prisma.$transaction(async (tx) => {
      const activeUser = await tx.user.findFirst({
        where: { id: stored.user.id, isActive: true, status: 'active' },
        select: { id: true },
      });
      if (!activeUser) {
        throw new UnauthorizedException('حساب کاربری غیرفعال است');
      }

      const consumed = await tx.refreshToken.deleteMany({
        where: { id: stored.id, expiresAt: { gte: now } },
      });
      if (consumed.count !== 1) {
        throw new UnauthorizedException('توکن بازنشانی نامعتبر است');
      }

      await tx.refreshToken.create({ data: tokenPair.persisted });
    });

    return {
      user: {
        id: stored.user.id,
        email: stored.user.email,
        name: stored.user.name,
        role: stored.user.role,
        avatarUrl: stored.user.avatarUrl,
      },
      ...tokenPair.response,
    };
  }

  async logout(dto: { refreshToken: string }) {
    const tokenHash = this.hashRefreshToken(dto.refreshToken);
    await this.prisma.refreshToken.deleteMany({
      where: { token: { in: [tokenHash, dto.refreshToken] } },
    });
    return { success: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        avatarUrl: true,
        phone: true,
        status: true,
        lastLoginAt: true,
        isActive: true,
        createdAt: true,
        tenantMembers: {
          where: {
            status: 'active',
            tenant: { status: 'active', isActive: true },
          },
          include: {
            tenant: {
              select: {
                id: true,
                name: true,
                slug: true,
                plan: true,
                locale: true,
                status: true,
                primaryOwnerUserId: true,
              },
            },
          },
        },
        receivedInvitations: {
          where: {
            status: 'pending',
            expiresAt: { gt: new Date() },
            tenant: { status: 'active', isActive: true },
          },
          select: {
            id: true,
            role: true,
            expiresAt: true,
            tenant: { select: { id: true, name: true, slug: true, plan: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('کاربر یافت نشد');
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      isActive: user.isActive,
      createdAt: user.createdAt,
      tenants: user.tenantMembers.map((m) => ({
        id: m.tenant.id,
        name: m.tenant.name,
        slug: m.tenant.slug,
        plan: m.tenant.plan,
        locale: m.tenant.locale,
        status: m.tenant.status,
        primaryOwnerUserId: m.tenant.primaryOwnerUserId,
        memberRole: m.role,
        membershipStatus: m.status,
        joinedAt: m.joinedAt,
      })),
      pendingInvitations: user.receivedInvitations,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const current = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!current?.isActive || current.status !== 'active') {
      throw new UnauthorizedException('حساب کاربری فعال نیست');
    }

    const email = dto.email?.trim().toLowerCase();
    const emailChanged = email !== undefined && email !== current.email;
    const phone = dto.phone === null
      ? null
      : dto.phone === undefined
        ? undefined
        : this.normalizePhone(dto.phone);
    const phoneVariants = phone ? this.phoneVariants(phone) : [];

    if (emailChanged) {
      if (!dto.currentPassword || !(await bcrypt.compare(dto.currentPassword, current.passwordHash))) {
        throw new UnauthorizedException('برای تغییر ایمیل، رمز عبور فعلی صحیح الزامی است');
      }
    }

    const conflicts = email || phoneVariants.length
      ? await this.prisma.user.findFirst({
        where: {
          id: { not: userId },
          OR: [
            ...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []),
            ...(phoneVariants.length ? [{ phone: { in: phoneVariants } }] : []),
          ],
        },
        select: { email: true, phone: true },
      })
      : null;
    if (conflicts?.email && email && conflicts.email.toLowerCase() === email) {
      throw new ConflictException('این ایمیل قبلاً ثبت شده است');
    }
    if (conflicts?.phone && phone) {
      throw new ConflictException('این شماره موبایل قبلاً ثبت شده است');
    }

    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
          where: { id: userId },
          data: {
            ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
            ...(email !== undefined ? { email } : {}),
            ...(phone !== undefined ? { phone } : {}),
            ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl?.trim() || null } : {}),
            ...(emailChanged ? {
              emailVerifiedAt: null,
              sessionsInvalidatedAt: new Date(),
            } : {}),
          },
          select: {
            id: true,
            email: true,
            phone: true,
            name: true,
            role: true,
            avatarUrl: true,
            status: true,
            isActive: true,
          },
        });
        if (emailChanged) {
          await tx.refreshToken.deleteMany({ where: { userId } });
          await tx.passwordResetToken.deleteMany({ where: { userId, usedAt: null } });
        }
        await tx.auditLog.create({
          data: {
            tenantId: null,
            userId,
            action: 'account.profile_updated',
            entityType: 'User',
            entityId: userId,
            changes: {
              nameChanged: dto.name !== undefined && dto.name.trim() !== current.name,
              emailChanged,
              phoneChanged: phone !== undefined && phone !== current.phone,
              avatarChanged: dto.avatarUrl !== undefined && dto.avatarUrl !== current.avatarUrl,
            },
          },
        });
        return user;
      });
      return { user: updated, requiresReauthentication: emailChanged };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('ایمیل یا شماره موبایل قبلاً ثبت شده است');
      }
      throw error;
    }
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.isActive) {
      throw new UnauthorizedException('حساب کاربری غیرفعال است');
    }

    const isValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('رمز عبور فعلی نادرست است');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, passwordChangedAt: new Date() },
      }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
    ]);

    return { success: true, message: 'رمز عبور با موفقیت تغییر کرد' };
  }

  private normalizePhone(value: string): string {
    const digits = normalizeDigits(value).replace(/[\s()-]/g, '');
    if (digits.startsWith('0098')) return `+98${digits.slice(4)}`;
    if (digits.startsWith('09')) return `+98${digits.slice(1)}`;
    return digits.startsWith('+') ? digits : `+${digits}`;
  }

  async employeeProfiles(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        firstName: true, lastName: true, nationalId: true, fatherName: true, motherName: true,
        birthCertificateNumber: true, birthCertificateDate: true, birthDate: true, maritalStatus: true,
        address: true, postalCode: true, mobilePhone: true, landlinePhone: true, bankAccountNumber: true,
        bankCardNumber: true, iban: true, bankName: true, insuranceNumber: true,
        tenantMembers: {
          where: { status: 'active', tenant: { isActive: true, status: 'active' } },
          select: { tenant: { select: { id: true, name: true, slug: true } } },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
    if (!user) throw new UnauthorizedException('کاربر یافت نشد');
    const { tenantMembers, ...profile } = user;
    return {
      profile: {
        ...profile,
        birthCertificateDate: profile.birthCertificateDate?.toISOString() ?? null,
        birthDate: profile.birthDate?.toISOString() ?? null,
      },
      organizations: tenantMembers.map((member) => member.tenant),
    };
  }

  async updateOwnEmployeeProfile(userId: string, dto: UpdateEmployeeProfileDto) {
    const current = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true, status: 'active' },
      select: { id: true },
    });
    if (!current) throw new UnauthorizedException('حساب کاربری فعال نیست');

    const provided = pickProvidedProfileFields(dto as unknown as EmployeeProfileInput);
    assertValidEmployeeProfile(provided, { requireAll: false });
    const normalized = normalizeEmployeeProfile(provided);
    await assertUniqueNationalId(this.prisma, '', normalized.nationalId, userId);

    const update: Prisma.UserUpdateInput = {};
    applyEmployeeProfileToUpdate(provided, update);
    if (Object.keys(update).length > 0) {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: userId }, data: update });
        // Keep legacy employee columns synchronized for modules that still read them.
        await tx.employee.updateMany({ where: { userId }, data: update as Prisma.EmployeeUpdateManyMutationInput });
        await tx.auditLog.create({
          data: {
            tenantId: null, userId, action: 'account.employee_profile_updated', entityType: 'User', entityId: userId,
            changes: { fields: Object.keys(update) },
          },
        });
      });
    }

    return this.employeeProfiles(userId);
  }

  async uploadProfileAvatar(userId: string, file?: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException('تصویر پروفایل انتخاب نشده است');

    const mimeTypes: Record<string, { extension: string; signature: (buffer: Buffer) => boolean }> = {
      'image/jpeg': { extension: 'jpg', signature: (buffer) => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
      'image/png': { extension: 'png', signature: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
      'image/webp': { extension: 'webp', signature: (buffer) => buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP' },
    };
    const image = mimeTypes[file.mimetype];
    if (!image || !image.signature(file.buffer)) {
      throw new BadRequestException('فرمت تصویر فقط باید JPG، PNG یا WebP باشد');
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true, status: 'active' },
      select: { id: true, avatarUrl: true },
    });
    if (!user) throw new UnauthorizedException('حساب کاربری فعال نیست');

    const filename = `${randomUUID()}.${image.extension}`;
    const directory = this.profileStorageDirectory(userId);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const targetPath = path.join(directory, filename);
    await fs.writeFile(targetPath, file.buffer, { mode: 0o600 });

    const avatarUrl = `/auth/profile/avatar/${userId}/${filename}`;
    await this.prisma.user.update({ where: { id: userId }, data: { avatarUrl } });
    await this.removePreviousAvatar(user.avatarUrl, userId, filename);
    return { avatarUrl };
  }

  async getProfileAvatar(requesterId: string, userId: string, filename: string) {
    if (!/^[a-f0-9-]{20,80}\.(?:jpg|png|webp)$/iu.test(filename)) {
      throw new NotFoundException('تصویر پروفایل یافت نشد');
    }
    const requester = await this.prisma.user.findFirst({
      where: { id: requesterId, isActive: true, status: 'active' },
      select: { id: true },
    });
    if (!requester) throw new UnauthorizedException('حساب کاربری فعال نیست');

    const expectedUrl = `/auth/profile/avatar/${userId}/${filename}`;
    const target = await this.prisma.user.findFirst({
      where: { id: userId, avatarUrl: expectedUrl, isActive: true, status: 'active' },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('تصویر پروفایل یافت نشد');

    const filePath = path.join(this.profileStorageDirectory(userId), filename);
    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundException('تصویر پروفایل یافت نشد');
    }
    return {
      path: filePath,
      contentType: filename.endsWith('.png') ? 'image/png' : filename.endsWith('.webp') ? 'image/webp' : 'image/jpeg',
    };
  }

  async listUserDocuments(userId: string) {
    await this.assertActiveUser(userId);
    const documents = await this.prisma.userDocument.findMany({
      where: { userId },
      select: {
        id: true,
        kind: true,
        originalName: true,
        mimeType: true,
        size: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return { documents };
  }

  async uploadNationalCard(userId: string, file?: Express.Multer.File) {
    if (!file?.buffer?.length) throw new BadRequestException('تصویر کارت ملی انتخاب نشده است');

    const imageTypes: Record<string, { extension: string; signature: (buffer: Buffer) => boolean }> = {
      'image/jpeg': {
        extension: 'jpg',
        signature: (buffer) => buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
      },
      'image/png': {
        extension: 'png',
        signature: (buffer) => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
      },
      'image/webp': {
        extension: 'webp',
        signature: (buffer) => buffer.length >= 12 && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP',
      },
    };
    const image = imageTypes[file.mimetype];
    if (!image || file.size > 5 * 1024 * 1024 || !image.signature(file.buffer)) {
      throw new BadRequestException('فرمت تصویر فقط باید JPG، PNG یا WebP و حداکثر ۵ مگابایت باشد');
    }

    await this.assertActiveUser(userId);
    const filename = `${randomUUID()}.${image.extension}`;
    const directory = this.userDocumentStorageDirectory(userId);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const targetPath = this.userDocumentPath(userId, filename);
    await fs.writeFile(targetPath, file.buffer, { mode: 0o600 });

    const originalName = path.basename(file.originalname || 'تصویر کارت ملی').trim().slice(0, 255) || 'تصویر کارت ملی';
    let previousPath: string | null = null;
    let document;
    try {
      document = await this.prisma.$transaction(async (tx) => {
        const previous = await tx.userDocument.findUnique({
          where: { userId_kind: { userId, kind: 'national_card' } },
          select: { name: true },
        });
        previousPath = previous ? this.userDocumentPath(userId, previous.name) : null;

        const saved = await tx.userDocument.upsert({
          where: { userId_kind: { userId, kind: 'national_card' } },
          create: {
            userId,
            kind: 'national_card',
            name: filename,
            originalName,
            mimeType: image.extension === 'jpg' ? 'image/jpeg' : file.mimetype,
            size: file.size,
            path: filename,
          },
          update: {
            name: filename,
            originalName,
            mimeType: image.extension === 'jpg' ? 'image/jpeg' : file.mimetype,
            size: file.size,
          },
          select: {
            id: true,
            kind: true,
            originalName: true,
            mimeType: true,
            size: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        await tx.auditLog.create({
          data: {
            tenantId: null,
            userId,
            action: 'account.user_document_uploaded',
            entityType: 'UserDocument',
            entityId: saved.id,
            changes: { kind: 'national_card', replaced: Boolean(previous) },
          },
        });
        return saved;
      });

    } catch (error) {
      await fs.rm(targetPath, { force: true });
      throw error;
    }

    // A cleanup failure must not remove the newly committed file or leave the
    // database pointing to a missing document. Orphan cleanup can be retried
    // later without affecting the user's current document.
    if (previousPath && previousPath !== targetPath) {
      await fs.rm(previousPath, { force: true }).catch(() => undefined);
    }
    return document;
  }

  async getUserDocument(userId: string, documentId: string) {
    await this.assertActiveUser(userId);
    const document = await this.prisma.userDocument.findFirst({
      where: { id: documentId, userId },
      select: { name: true, mimeType: true, originalName: true },
    });
    if (!document) throw new NotFoundException('سند کاربر یافت نشد');

    const filePath = this.userDocumentPath(userId, document.name);
    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundException('فایل سند کاربر یافت نشد');
    }
    return { path: filePath, contentType: document.mimeType, originalName: document.originalName };
  }

  async removeUserDocument(userId: string, documentId: string) {
    await this.assertActiveUser(userId);
    const document = await this.prisma.userDocument.findFirst({
      where: { id: documentId, userId },
      select: { id: true, name: true, kind: true },
    });
    if (!document) throw new NotFoundException('سند کاربر یافت نشد');

    await this.prisma.$transaction(async (tx) => {
      await tx.userDocument.delete({ where: { id: document.id } });
      await tx.auditLog.create({
        data: {
          tenantId: null,
          userId,
          action: 'account.user_document_deleted',
          entityType: 'UserDocument',
          entityId: document.id,
          changes: { kind: document.kind },
        },
      });
    });
    await fs.rm(this.userDocumentPath(userId, document.name), { force: true });
    return { success: true };
  }

  private async assertActiveUser(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true, status: 'active' },
      select: { id: true },
    });
    if (!user) throw new UnauthorizedException('حساب کاربری فعال نیست');
  }

  private userDocumentStorageDirectory(userId: string) {
    return path.resolve(process.env.STORAGE_PATH || path.resolve(process.cwd(), 'uploads'), 'user-documents', userId);
  }

  private userDocumentPath(userId: string, filename: string) {
    const directory = path.resolve(this.userDocumentStorageDirectory(userId));
    const safeFilename = path.basename(filename);
    const resolved = path.resolve(directory, safeFilename);
    if (path.dirname(resolved) !== directory || safeFilename !== filename) {
      throw new NotFoundException('مسیر سند کاربر نامعتبر است');
    }
    return resolved;
  }

  private profileStorageDirectory(userId: string) {
    return path.resolve(process.env.STORAGE_PATH || path.resolve(process.cwd(), 'uploads'), 'profiles', userId);
  }

  private async removePreviousAvatar(avatarUrl: string | null, userId: string, currentFilename: string) {
    const prefix = `/auth/profile/avatar/${userId}/`;
    if (!avatarUrl?.startsWith(prefix)) return;
    const previousFilename = path.basename(avatarUrl.slice(prefix.length));
    if (!previousFilename || previousFilename === currentFilename || previousFilename.includes('..')) return;
    await fs.rm(path.join(this.profileStorageDirectory(userId), previousFilename), { force: true });
  }

  private phoneVariants(canonicalPhone: string): string[] {
    const variants = new Set([canonicalPhone]);
    if (canonicalPhone.startsWith('+98')) variants.add(`0${canonicalPhone.slice(3)}`);
    return [...variants];
  }

  async setPassword(userId: string, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, passwordChangedAt: new Date() },
      }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
    ]);
  }

  private async issueTokens(userId: string, email: string, role: string) {
    const tokenPair = this.createTokenPair(userId, email, role);

    await this.prisma.refreshToken.create({
      data: tokenPair.persisted,
    });

    return tokenPair.response;
  }

  private createTokenPair(userId: string, email: string, role: string) {
    const payload: JwtPayload = { sub: userId, email, role };
    const accessExpires = this.config.get<string>('JWT_ACCESS_EXPIRES', '15m');
    const refreshExpires = this.config.get<string>('JWT_REFRESH_EXPIRES', '7d');
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: accessExpires as `${number}${'s' | 'm' | 'h' | 'd'}`,
    });
    const refreshToken = randomUUID();

    return {
      persisted: {
        token: this.hashRefreshToken(refreshToken),
        userId,
        expiresAt: this.parseDuration(refreshExpires),
      },
      response: { accessToken, refreshToken, expiresIn: accessExpires },
    };
  }

  private parseDuration(duration: string): Date {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) {
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return new Date(Date.now() + value * multipliers[unit]);
  }

  async logoutAll(userId: string) {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { sessionsInvalidatedAt: new Date() },
      }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
    ]);
    return { success: true };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
    });
    const generic = { message: 'اگر حسابی با این ایمیل وجود داشته باشد، راهنمای بازیابی ارسال می‌شود' };
    if (!user || !user.isActive || user.status !== 'active') return generic;

    const token = randomUUID();
    const tokenHash = this.hashRefreshToken(token);
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }),
      this.prisma.passwordResetToken.create({
        data: { tokenHash, userId: user.id, expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
      }),
    ]);

    // An email provider can consume this value in production. Never expose it there.
    if (this.config.get<string>('NODE_ENV') !== 'production') {
      return { ...generic, developmentToken: token };
    }
    return generic;
  }

  async resetPassword(dto: ResetPasswordDto) {
    const invalidTokenMessage = 'توکن بازیابی نامعتبر یا منقضی شده است';
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('رمز عبور و تکرار آن یکسان نیست');
    }
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: this.hashRefreshToken(dto.token) },
      include: { user: true },
    });
    if (!record || record.usedAt || record.expiresAt < new Date() || !record.user.isActive) {
      throw new BadRequestException(invalidTokenMessage);
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const consumedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.passwordResetToken.updateMany({
        where: {
          id: record.id,
          usedAt: null,
          expiresAt: { gte: consumedAt },
        },
        data: { usedAt: consumedAt },
      });
      if (consumed.count !== 1) {
        throw new BadRequestException(invalidTokenMessage);
      }

      const updatedUser = await tx.user.updateMany({
        where: { id: record.userId, isActive: true },
        data: {
          passwordHash,
          passwordChangedAt: consumedAt,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      if (updatedUser.count !== 1) {
        throw new BadRequestException(invalidTokenMessage);
      }

      await tx.refreshToken.deleteMany({ where: { userId: record.userId } });
    });
    return { success: true, message: 'رمز عبور با موفقیت بازنشانی شد' };
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
