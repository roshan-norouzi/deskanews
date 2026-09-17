import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  resolveContactDisplayName,
  validateIranLandline,
  validateIranMobile,
  validateIranNationalId,
  validateIranPostalCode,
  validateBankAccountNumber,
  validateBankCardNumber,
  validateIranIban,
  normalizeIban,
  IRAN_BANKS,
} from '@deska/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  removeContactCalendarEvents,
  syncAllContactCalendarEvents,
  syncContactCalendarEvents,
} from './contact-calendar-sync';

export interface ContactQuery {
  search?: string;
  type?: string;
  isActive?: boolean;
  skip?: number;
  take?: number;
}

function parseDate(value: unknown): Date | null | undefined {
  if (value === null) return null;
  if (value === undefined || value === '') return undefined;
  if (value instanceof Date) return value;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) throw new BadRequestException('تاریخ واردشده معتبر نیست');
  return d;
}

function normalizeDigits(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  const raw = String(value).trim();
  if (/[^0-9۰-۹]/.test(raw)) {
    throw new BadRequestException('این فیلد فقط باید شامل رقم باشد');
  }
  const normalized = raw.replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
  return normalized || null;
}

function normalizePostalCode(value: unknown): string | null {
  const postalCode = normalizeDigits(value);
  if (postalCode && (!validateIranPostalCode(postalCode))) {
    throw new BadRequestException('کدپستی باید یک مقدار معتبر ۱۰ رقمی باشد');
  }
  return postalCode;
}

function validateContactNumericFields(data: Record<string, unknown>) {
  const phone = normalizeDigits(data.phone);
  const mobile = normalizeDigits(data.mobile);
  const nationalId = normalizeDigits(data.nationalId);

  if (phone && !validateIranLandline(phone)) {
    throw new BadRequestException('تلفن ثابت باید ۱۱ رقم و با صفر شروع شود');
  }
  if (mobile && !validateIranMobile(mobile)) {
    throw new BadRequestException('موبایل باید یک شماره معتبر ۱۱ رقمی باشد');
  }
  const type = data.type === 'company' ? 'company' : 'person';
  if (nationalId && type === 'person' && !validateIranNationalId(nationalId)) {
    throw new BadRequestException('کد ملی معتبر نیست');
  }
  if (nationalId && type === 'company' && (!/^\d{11}$/.test(nationalId) || /^(\d)\1{10}$/.test(nationalId))) {
    throw new BadRequestException('شناسه ملی شرکت باید یک مقدار معتبر ۱۱ رقمی باشد');
  }
  for (const [field, max] of [
    ['economicCode', 20],
    ['registrationNumber', 20],
  ] as const) {
    const value = normalizeDigits(data[field]);
    if (value && value.length > max) {
      throw new BadRequestException(`${field} نباید بیشتر از ${max} رقم باشد`);
    }
  }
}

function validateContactPayload(data: Record<string, unknown>, partial = false) {
  const type = data.type === undefined && partial ? undefined : (data.type ?? 'person');
  if (type !== undefined && type !== 'person' && type !== 'company') {
    throw new BadRequestException('نوع مخاطب معتبر نیست');
  }
  for (const [field, max] of [
    ['firstName', 100], ['lastName', 100], ['companyName', 200], ['address', 1000],
    ['city', 100], ['province', 100], ['website', 500], ['notes', 5000],
  ] as const) {
    const value = data[field];
    if (value !== undefined && value !== null && String(value).length > max) {
      throw new BadRequestException(`${field} بیش از حد مجاز طولانی است`);
    }
  }
  if (data.email !== undefined && data.email !== null && data.email !== '') {
    const email = String(data.email).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('ایمیل معتبر نیست');
    }
  }
  if (data.website !== undefined && data.website !== null && data.website !== '') {
    try {
      const website = new URL(String(data.website));
      if (website.protocol !== 'https:') throw new Error('invalid protocol');
    } catch { throw new BadRequestException('نشانی وب‌سایت باید معتبر و با https:// شروع شود'); }
  }
  if (!partial || type !== undefined) {
    if (type === 'person' && (!String(data.firstName ?? '').trim() || !String(data.lastName ?? '').trim())) {
      throw new BadRequestException('نام و نام خانوادگی برای مخاطب شخصی الزامی است');
    }
    if (type === 'company' && !String(data.companyName ?? '').trim()) {
      throw new BadRequestException('نام شرکت الزامی است');
    }
  }
}

function normalizeBankAccountPayload(data: {
  bankName?: string; accountNumber?: string; cardNumber?: string; sheba?: string; isDefault?: boolean;
}) {
  const bankName = data.bankName?.trim();
  const accountNumber = normalizeDigits(data.accountNumber) ?? undefined;
  const cardNumber = normalizeDigits(data.cardNumber) ?? undefined;
  const sheba = data.sheba ? normalizeIban(data.sheba) : undefined;
  if (data.bankName !== undefined && (!bankName || !IRAN_BANKS.includes(bankName as (typeof IRAN_BANKS)[number]))) {
    throw new BadRequestException('نام بانک معتبر نیست');
  }
  if (accountNumber && !validateBankAccountNumber(accountNumber)) {
    throw new BadRequestException('شماره حساب باید ۶ تا ۲۰ رقم باشد');
  }
  if (cardNumber && !validateBankCardNumber(cardNumber)) {
    throw new BadRequestException('شماره کارت بانکی معتبر نیست');
  }
  if (sheba && !validateIranIban(sheba)) {
    throw new BadRequestException('شماره شبا معتبر نیست');
  }
  return { ...data, bankName, accountNumber, cardNumber, sheba };
}

function normalizeContactPayload(
  data: Record<string, unknown>,
  partial = false,
): Prisma.ContactUpdateInput {
  const type = (data.type as string) || (partial ? undefined : 'person');
  const resolvedName =
    data.name !== undefined ||
    data.firstName !== undefined ||
    data.lastName !== undefined ||
    data.companyName !== undefined ||
    data.type !== undefined
      ? resolveContactDisplayName({
          type: (type as string) || 'person',
          name: data.name as string | undefined,
          firstName: data.firstName as string | undefined,
          lastName: data.lastName as string | undefined,
          companyName: data.companyName as string | undefined,
        })
      : undefined;

  const payload: Prisma.ContactUpdateInput = {};

  if (resolvedName !== undefined) payload.name = resolvedName;
  if (type !== undefined) payload.type = type;
  if (data.firstName !== undefined) payload.firstName = (data.firstName as string) || null;
  if (data.lastName !== undefined) payload.lastName = (data.lastName as string) || null;
  if (data.email !== undefined) payload.email = (data.email as string) || null;
  if (data.phone !== undefined) payload.phone = normalizeDigits(data.phone);
  if (data.mobile !== undefined) payload.mobile = normalizeDigits(data.mobile);
  if (data.nationalId !== undefined) payload.nationalId = normalizeDigits(data.nationalId);
  if (data.economicCode !== undefined) payload.economicCode = normalizeDigits(data.economicCode);
  if (data.registrationNumber !== undefined) {
    payload.registrationNumber = normalizeDigits(data.registrationNumber);
  }
  if (data.companyName !== undefined) payload.companyName = (data.companyName as string) || null;
  if (data.address !== undefined) payload.address = (data.address as string) || null;
  if (data.city !== undefined) payload.city = (data.city as string) || null;
  if (data.province !== undefined) payload.province = (data.province as string) || null;
  if (data.postalCode !== undefined) payload.postalCode = normalizePostalCode(data.postalCode);
  if (data.website !== undefined) payload.website = (data.website as string) || null;
  if (data.notes !== undefined) payload.notes = (data.notes as string) || null;
  if (data.isActive !== undefined) payload.isActive = Boolean(data.isActive);
  if (data.birthDate !== undefined) payload.birthDate = parseDate(data.birthDate);
  if (data.marriageDate !== undefined) payload.marriageDate = parseDate(data.marriageDate);

  const nextType = (data.type as string) || (partial ? undefined : 'person');
  if (nextType === 'company') {
    payload.marriageDate = null;
  }

  return payload;
}

@Injectable()
export class ContactsService {
  constructor(private prisma: PrismaService) {}

  private async ensureUniqueNationalId(tenantId: string, value: unknown, excludeId?: string) {
    const nationalId = normalizeDigits(value);
    if (!nationalId) return;
    const duplicate = await this.prisma.contact.findFirst({
      where: { tenantId, nationalId, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (duplicate) throw new BadRequestException('مخاطب دیگری با این کد یا شناسه ملی ثبت شده است');
  }

  async findAll(tenantId: string, query: ContactQuery = {}) {
    const { search, type, isActive, skip = 0, take = 50 } = query;
    const where: Prisma.ContactWhereInput = { tenantId };

    if (type) where.type = type;
    if (isActive !== undefined) where.isActive = isActive;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { mobile: { contains: search, mode: 'insensitive' } },
        { companyName: { contains: search, mode: 'insensitive' } },
        { nationalId: { contains: search, mode: 'insensitive' } },
        { economicCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { bankAccounts: { orderBy: { isDefault: 'desc' } } },
      }),
      this.prisma.contact.count({ where }),
    ]);

    return { items, total };
  }

  async findOne(tenantId: string, id: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id, tenantId },
      include: { bankAccounts: { orderBy: { isDefault: 'desc' } } },
    });
    if (!contact) throw new NotFoundException('مخاطب یافت نشد');
    return contact;
  }

  async create(tenantId: string, data: Record<string, unknown>) {
    validateContactPayload(data);
    validateContactNumericFields(data);
    await this.ensureUniqueNationalId(tenantId, data.nationalId);
    const type = (data.type as string) || 'person';
    const name = resolveContactDisplayName({
      type,
      name: data.name as string | undefined,
      firstName: data.firstName as string | undefined,
      lastName: data.lastName as string | undefined,
      companyName: data.companyName as string | undefined,
    });

    return this.prisma.contact.create({
      data: {
        tenantId,
        name,
        type,
        firstName: (data.firstName as string) || null,
        lastName: (data.lastName as string) || null,
        email: (data.email as string) || null,
        phone: normalizeDigits(data.phone),
        mobile: normalizeDigits(data.mobile),
        nationalId: normalizeDigits(data.nationalId),
        economicCode: normalizeDigits(data.economicCode),
        registrationNumber: normalizeDigits(data.registrationNumber),
        companyName: (data.companyName as string) || null,
        address: (data.address as string) || null,
        city: (data.city as string) || null,
        province: (data.province as string) || null,
        postalCode: normalizePostalCode(data.postalCode),
        website: (data.website as string) || null,
        notes: (data.notes as string) || null,
        birthDate: parseDate(data.birthDate) ?? null,
        marriageDate: type === 'company' ? null : parseDate(data.marriageDate) ?? null,
        membershipDate: parseDate(data.membershipDate) ?? new Date(),
        isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
      },
      include: { bankAccounts: true },
    }).then(async (contact) => {
      await syncContactCalendarEvents(this.prisma, tenantId, contact);
      return contact;
    });
  }

  async update(tenantId: string, id: string, data: Record<string, unknown>) {
    const existing = await this.findOne(tenantId, id);
    validateContactPayload({ ...existing, ...data }, false);
    validateContactNumericFields({ ...existing, ...data });
    await this.ensureUniqueNationalId(tenantId, data.nationalId ?? existing.nationalId, id);
    const payload = normalizeContactPayload(data, true);
    const contact = await this.prisma.contact.update({
      where: { id },
      data: payload,
      include: { bankAccounts: true },
    });
    await syncContactCalendarEvents(this.prisma, tenantId, contact);
    return contact;
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    await removeContactCalendarEvents(this.prisma, tenantId, id);
    return this.prisma.contact.delete({ where: { id } });
  }

  async syncCalendarEvents(tenantId: string) {
    await syncAllContactCalendarEvents(this.prisma, tenantId);
    return { ok: true };
  }

  // --- Bank accounts ---

  async findBankAccounts(tenantId: string, contactId: string) {
    await this.findOne(tenantId, contactId);
    return this.prisma.contactBankAccount.findMany({
      where: { tenantId, contactId },
      orderBy: [{ isDefault: 'desc' }, { bankName: 'asc' }],
    });
  }

  async createBankAccount(
    tenantId: string,
    contactId: string,
    data: {
      bankName: string;
      accountNumber?: string;
      cardNumber?: string;
      sheba?: string;
      isDefault?: boolean;
    },
  ) {
    await this.findOne(tenantId, contactId);
    const normalized = normalizeBankAccountPayload(data);
    if (!normalized.bankName) throw new BadRequestException('نام بانک الزامی است');
    const bankName = normalized.bankName;

    return this.prisma.$transaction(async (tx) => {
      if (normalized.isDefault) {
        await tx.contactBankAccount.updateMany({
          where: { tenantId, contactId },
          data: { isDefault: false },
        });
      }

      return tx.contactBankAccount.create({
        data: {
          tenantId,
          contactId,
          bankName,
          accountNumber: normalized.accountNumber,
          cardNumber: normalized.cardNumber,
          sheba: normalized.sheba,
          isDefault: normalized.isDefault ?? false,
        },
      });
    });
  }

  async updateBankAccount(
    tenantId: string,
    contactId: string,
    accountId: string,
    data: {
      bankName?: string;
      accountNumber?: string;
      cardNumber?: string;
      sheba?: string;
      isDefault?: boolean;
    },
  ) {
    const account = await this.prisma.contactBankAccount.findFirst({
      where: { id: accountId, tenantId, contactId },
    });
    if (!account) throw new NotFoundException('حساب بانکی یافت نشد');
    const normalized = normalizeBankAccountPayload(data);

    return this.prisma.$transaction(async (tx) => {
      if (normalized.isDefault) {
        await tx.contactBankAccount.updateMany({
          where: { tenantId, contactId },
          data: { isDefault: false },
        });
      }

      return tx.contactBankAccount.update({
        where: { id: accountId },
        data: normalized,
      });
    });
  }

  async removeBankAccount(tenantId: string, contactId: string, accountId: string) {
    const account = await this.prisma.contactBankAccount.findFirst({
      where: { id: accountId, tenantId, contactId },
    });
    if (!account) throw new NotFoundException('حساب بانکی یافت نشد');
    return this.prisma.contactBankAccount.delete({ where: { id: accountId } });
  }
}
