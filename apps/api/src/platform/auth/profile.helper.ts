import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type EmployeeProfileInput,
  normalizeEmployeeProfile,
  validateEmployeeProfile,
} from '@deska/shared';
import { PrismaService } from '../../prisma/prisma.service';

export function assertValidEmployeeProfile(
  input: EmployeeProfileInput,
  options?: { requireAll?: boolean },
): void {
  const result = validateEmployeeProfile(input, options);
  if (!result.valid) {
    const firstError = Object.values(result.errors)[0];
    throw new BadRequestException(firstError || 'اطلاعات پروفایل معتبر نیست');
  }
}

export function applyEmployeeProfileToUpdate(
  input: EmployeeProfileInput,
  update: Prisma.UserUpdateInput,
): void {
  const normalized = normalizeEmployeeProfile(input);
  if (normalized.firstName !== undefined) update.firstName = normalized.firstName;
  if (normalized.lastName !== undefined) update.lastName = normalized.lastName;
  if (normalized.nationalId !== undefined) update.nationalId = normalized.nationalId;
  if (normalized.fatherName !== undefined) update.fatherName = normalized.fatherName;
  if (normalized.motherName !== undefined) update.motherName = normalized.motherName;
  if (normalized.birthCertificateNumber !== undefined) update.birthCertificateNumber = normalized.birthCertificateNumber;
  if (normalized.birthCertificateDate !== undefined) update.birthCertificateDate = new Date(normalized.birthCertificateDate);
  if (normalized.birthDate !== undefined) update.birthDate = new Date(normalized.birthDate);
  if (normalized.maritalStatus !== undefined) update.maritalStatus = normalized.maritalStatus;
  if (normalized.address !== undefined) update.address = normalized.address;
  if (normalized.postalCode !== undefined) update.postalCode = normalized.postalCode;
  if (normalized.mobilePhone !== undefined) update.mobilePhone = normalized.mobilePhone;
  if (normalized.landlinePhone !== undefined) update.landlinePhone = normalized.landlinePhone;
  if (normalized.bankAccountNumber !== undefined) update.bankAccountNumber = normalized.bankAccountNumber;
  if (normalized.bankCardNumber !== undefined) update.bankCardNumber = normalized.bankCardNumber;
  if (normalized.iban !== undefined) update.iban = normalized.iban;
  if (normalized.bankName !== undefined) update.bankName = normalized.bankName;
  if (normalized.insuranceNumber !== undefined) update.insuranceNumber = normalized.insuranceNumber;
}

export async function assertUniqueNationalId(
  prisma: PrismaService,
  _tenantId: string,
  nationalId?: string,
  excludeUserId?: string,
): Promise<void> {
  if (!nationalId?.trim()) return;
  const duplicate = await prisma.user.findFirst({
    where: {
      nationalId,
      ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
    },
    select: { id: true },
  });
  if (duplicate) throw new ConflictException('این کد ملی قبلاً ثبت شده است');
}
