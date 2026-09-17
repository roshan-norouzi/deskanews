import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  EmployeeProfileInput,
  normalizeEmployeeProfile,
  pickProvidedProfileFields,
  validateEmployeeProfile,
} from '@deska/shared';
import { PrismaService } from '../../prisma/prisma.service';

export type EmployeeProfileDtoShape = EmployeeProfileInput;

export function assertValidEmployeeProfile(
  input: EmployeeProfileDtoShape,
  options?: { requireAll?: boolean },
) {
  const result = validateEmployeeProfile(input, options);
  if (!result.valid) {
    const firstError = Object.values(result.errors)[0] ?? 'اطلاعات کارمند معتبر نیست';
    throw new BadRequestException(firstError);
  }
}

export function applyEmployeeProfileToUpdate(
  dto: EmployeeProfileDtoShape,
  target: Prisma.UserUpdateInput,
) {
  const provided = pickProvidedProfileFields(dto);
  const profile = normalizeEmployeeProfile(provided);

  if (provided.firstName !== undefined) target.firstName = profile.firstName ?? null;
  if (provided.lastName !== undefined) target.lastName = profile.lastName ?? null;
  if (provided.nationalId !== undefined) target.nationalId = profile.nationalId ?? null;
  if (provided.fatherName !== undefined) target.fatherName = profile.fatherName ?? null;
  if (provided.motherName !== undefined) target.motherName = profile.motherName ?? null;
  if (provided.birthCertificateNumber !== undefined) {
    target.birthCertificateNumber = profile.birthCertificateNumber ?? null;
  }
  if (provided.birthCertificateDate !== undefined) {
    target.birthCertificateDate = profile.birthCertificateDate
      ? new Date(profile.birthCertificateDate)
      : null;
  }
  if (provided.birthDate !== undefined) {
    target.birthDate = profile.birthDate ? new Date(profile.birthDate) : null;
  }
  if (provided.maritalStatus !== undefined) target.maritalStatus = profile.maritalStatus ?? null;
  if (provided.address !== undefined) target.address = profile.address ?? null;
  if (provided.postalCode !== undefined) target.postalCode = profile.postalCode ?? null;
  if (provided.mobilePhone !== undefined) target.mobilePhone = profile.mobilePhone ?? null;
  if (provided.landlinePhone !== undefined) target.landlinePhone = profile.landlinePhone ?? null;
  if (provided.bankAccountNumber !== undefined) {
    target.bankAccountNumber = profile.bankAccountNumber ?? null;
  }
  if (provided.bankCardNumber !== undefined) target.bankCardNumber = profile.bankCardNumber ?? null;
  if (provided.iban !== undefined) target.iban = profile.iban ?? null;
  if (provided.bankName !== undefined) target.bankName = profile.bankName ?? null;
  if (provided.insuranceNumber !== undefined) {
    target.insuranceNumber = profile.insuranceNumber ?? null;
  }

  return profile;
}

export async function assertUniqueNationalId(
  prisma: PrismaService,
  tenantId: string,
  nationalId: string | undefined | null,
  excludeUserId?: string,
) {
  if (!nationalId) return;

  const duplicate = await prisma.user.findFirst({
    where: {
      nationalId,
      ...(excludeUserId ? { NOT: { id: excludeUserId } } : {}),
    },
  });

  if (duplicate) {
    throw new ConflictException('این کد ملی قبلاً برای کارمند دیگری ثبت شده است');
  }
}
