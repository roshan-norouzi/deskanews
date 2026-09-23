import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  readonly reader: PrismaClient;

  constructor() {
    super();
    const replica = process.env.DATABASE_REPLICA_URL?.trim();
    this.reader = replica ? new PrismaClient({ datasources: { db: { url: replica } } }) : this;
  }

  async onModuleInit() {
    await this.$connect();
    if (this.reader !== this) await this.reader.$connect();
  }

  async onModuleDestroy() {
    if (this.reader !== this) await this.reader.$disconnect();
    await this.$disconnect();
  }
}
