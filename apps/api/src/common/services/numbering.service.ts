import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NumberingService {
  constructor(private prisma: PrismaService) {}

  async next(tenantId: string, code: string): Promise<string> {
    const seq = await this.prisma.numberSequence.upsert({
      where: { tenantId_code: { tenantId, code } },
      create: { tenantId, code, nextNumber: 2 },
      update: { nextNumber: { increment: 1 } },
    });

    const num = seq.nextNumber - 1;
    const padded = String(num).padStart(seq.padding, '0');
    return `${seq.prefix}${padded}${seq.suffix}`;
  }
}
