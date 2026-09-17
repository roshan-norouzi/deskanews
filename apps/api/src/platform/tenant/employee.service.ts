import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const employeeInclude = {
  department: true,
  user: { select: { id: true, name: true, email: true } },
  contact: { select: { id: true, name: true, email: true } },
} satisfies Prisma.EmployeeInclude;

@Injectable()
export class EmployeeService {
  constructor(private readonly prisma: PrismaService) {}

  findEmployees(tenantId: string, status?: string) {
    return this.prisma.employee.findMany({
      where: { tenantId, ...(status ? { status } : {}) },
      include: employeeInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findEmployee(tenantId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { tenantId, id },
      include: employeeInclude,
    });
    if (!employee) throw new NotFoundException('کارمند یافت نشد');
    return employee;
  }

  async findEmployeeProfile(tenantId: string, id: string) {
    return { employee: await this.findEmployee(tenantId, id) };
  }

  findDepartments(tenantId: string) {
    return this.prisma.department.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }
}
