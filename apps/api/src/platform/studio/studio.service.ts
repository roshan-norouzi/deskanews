import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CUSTOM_FIELD_TYPES, CustomFieldType } from '@deska/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { SetCustomFieldValuesDto } from './dto/set-custom-field-values.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';

interface ValueRecord {
  valueText: string | null;
  valueNumber: { toNumber(): number } | null;
  valueDate: Date | null;
  valueBoolean: boolean | null;
  valueJson: unknown;
}

interface FieldDefinition {
  fieldName: string;
  fieldLabel: string;
  fieldType: string;
  required: boolean;
  options: unknown;
  entityType: string;
}

@Injectable()
export class StudioService {
  constructor(private prisma: PrismaService) {}

  async findFields(tenantId: string, entityType?: string, moduleId?: string) {
    return this.prisma.customFieldDefinition.findMany({
      where: {
        tenantId,
        ...(entityType && { entityType }),
        ...(moduleId && { moduleId }),
      },
      orderBy: [{ entityType: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  async findField(tenantId: string, fieldId: string) {
    const field = await this.prisma.customFieldDefinition.findFirst({
      where: { id: fieldId, tenantId },
    });

    if (!field) {
      throw new NotFoundException('فیلد سفارشی یافت نشد');
    }

    return field;
  }

  async createField(tenantId: string, dto: CreateCustomFieldDto) {
    const existing = await this.prisma.customFieldDefinition.findUnique({
      where: {
        tenantId_entityType_fieldName: {
          tenantId,
          entityType: dto.entityType,
          fieldName: dto.fieldName,
        },
      },
    });

    if (existing) {
      throw new ConflictException('فیلدی با این نام برای این موجودیت قبلاً وجود دارد');
    }

    if (dto.fieldType === CUSTOM_FIELD_TYPES.SELECT && (!dto.options || dto.options.length === 0)) {
      throw new BadRequestException('فیلد انتخابی باید گزینه‌ها را داشته باشد');
    }

    return this.prisma.customFieldDefinition.create({
      data: {
        tenantId,
        moduleId: dto.moduleId,
        entityType: dto.entityType,
        fieldName: dto.fieldName,
        fieldLabel: dto.fieldLabel,
        fieldType: dto.fieldType,
        options: dto.options ?? undefined,
        required: dto.required ?? false,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateField(tenantId: string, fieldId: string, dto: UpdateCustomFieldDto) {
    await this.findField(tenantId, fieldId);

    return this.prisma.customFieldDefinition.update({
      where: { id: fieldId },
      data: {
        ...(dto.fieldLabel !== undefined && { fieldLabel: dto.fieldLabel }),
        ...(dto.options !== undefined && { options: dto.options }),
        ...(dto.required !== undefined && { required: dto.required }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      },
    });
  }

  async removeField(tenantId: string, fieldId: string) {
    const field = await this.findField(tenantId, fieldId);

    await this.prisma.$transaction([
      this.prisma.customFieldValue.deleteMany({
        where: {
          tenantId,
          entityType: field.entityType,
          fieldName: field.fieldName,
        },
      }),
      this.prisma.customFieldDefinition.delete({ where: { id: fieldId } }),
    ]);

    return { success: true, message: 'فیلد سفارشی با موفقیت حذف شد' };
  }

  async getEntityValues(tenantId: string, entityType: string, entityId: string) {
    const [definitions, values] = await Promise.all([
      this.prisma.customFieldDefinition.findMany({
        where: { tenantId, entityType },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.customFieldValue.findMany({
        where: { tenantId, entityType, entityId },
      }),
    ]);

    const valueMap = new Map(values.map((v: { fieldName: string }) => [v.fieldName, v]));

    return definitions.map((def: FieldDefinition) => {
      const val = valueMap.get(def.fieldName) as ValueRecord | undefined;
      return {
        fieldName: def.fieldName,
        fieldLabel: def.fieldLabel,
        fieldType: def.fieldType,
        required: def.required,
        options: def.options,
        value: val ? this.extractValue(val, def.fieldType as CustomFieldType) : null,
      };
    });
  }

  async setEntityValues(tenantId: string, dto: SetCustomFieldValuesDto) {
    const definitions = await this.prisma.customFieldDefinition.findMany({
      where: { tenantId, entityType: dto.entityType },
    });

    const defMap = new Map(definitions.map((d: FieldDefinition) => [d.fieldName, d]));

    for (const item of dto.values) {
      const def = defMap.get(item.fieldName);
      if (!def) {
        throw new BadRequestException(`فیلد "${item.fieldName}" تعریف نشده است`);
      }

      if (def.required && this.isEmptyValue(item, def.fieldType)) {
        throw new BadRequestException(`فیلد "${def.fieldLabel}" الزامی است`);
      }
    }

    const requiredFields = definitions.filter((d: FieldDefinition) => d.required);
    for (const req of requiredFields) {
      const provided = dto.values.find((v) => v.fieldName === req.fieldName);
      if (!provided || this.isEmptyValue(provided, req.fieldType)) {
        throw new BadRequestException(`فیلد "${req.fieldLabel}" الزامی است`);
      }
    }

    await this.prisma.$transaction(
      dto.values.map((item) => {
        const def = defMap.get(item.fieldName) as FieldDefinition;
        const data = this.buildValueData(item, def.fieldType);

        return this.prisma.customFieldValue.upsert({
          where: {
            tenantId_entityType_entityId_fieldName: {
              tenantId,
              entityType: dto.entityType,
              entityId: dto.entityId,
              fieldName: item.fieldName,
            },
          },
          create: {
            tenantId,
            entityType: dto.entityType,
            entityId: dto.entityId,
            fieldName: item.fieldName,
            ...data,
          } as Parameters<typeof this.prisma.customFieldValue.create>[0]['data'],
          update: data as Parameters<typeof this.prisma.customFieldValue.update>[0]['data'],
        });
      }),
    );

    return this.getEntityValues(tenantId, dto.entityType, dto.entityId);
  }

  private buildValueData(
    item: SetCustomFieldValuesDto['values'][number],
    fieldType: string,
  ) {
    const empty = {
      valueText: null,
      valueNumber: null,
      valueDate: null,
      valueBoolean: null,
      valueJson: null,
    };

    switch (fieldType) {
      case CUSTOM_FIELD_TYPES.TEXT:
      case CUSTOM_FIELD_TYPES.SELECT:
      case CUSTOM_FIELD_TYPES.RELATION:
        return { ...empty, valueText: item.valueText ?? null };
      case CUSTOM_FIELD_TYPES.NUMBER:
        return { ...empty, valueNumber: item.valueNumber ?? null };
      case CUSTOM_FIELD_TYPES.DATE:
        return { ...empty, valueDate: item.valueDate ? new Date(item.valueDate) : null };
      case CUSTOM_FIELD_TYPES.BOOLEAN:
        return { ...empty, valueBoolean: item.valueBoolean ?? null };
      default:
        return { ...empty, valueJson: item.valueJson ?? null };
    }
  }

  private extractValue(record: ValueRecord, fieldType: CustomFieldType): unknown {
    switch (fieldType) {
      case CUSTOM_FIELD_TYPES.TEXT:
      case CUSTOM_FIELD_TYPES.SELECT:
      case CUSTOM_FIELD_TYPES.RELATION:
        return record.valueText;
      case CUSTOM_FIELD_TYPES.NUMBER:
        return record.valueNumber ? Number(record.valueNumber) : null;
      case CUSTOM_FIELD_TYPES.DATE:
        return record.valueDate?.toISOString() ?? null;
      case CUSTOM_FIELD_TYPES.BOOLEAN:
        return record.valueBoolean;
      default:
        return record.valueJson;
    }
  }

  private isEmptyValue(
    item: SetCustomFieldValuesDto['values'][number],
    fieldType: string,
  ): boolean {
    switch (fieldType) {
      case CUSTOM_FIELD_TYPES.TEXT:
      case CUSTOM_FIELD_TYPES.SELECT:
      case CUSTOM_FIELD_TYPES.RELATION:
        return !item.valueText?.trim();
      case CUSTOM_FIELD_TYPES.NUMBER:
        return item.valueNumber === undefined || item.valueNumber === null;
      case CUSTOM_FIELD_TYPES.DATE:
        return !item.valueDate;
      case CUSTOM_FIELD_TYPES.BOOLEAN:
        return item.valueBoolean === undefined || item.valueBoolean === null;
      default:
        return item.valueJson === undefined || item.valueJson === null;
    }
  }
}
