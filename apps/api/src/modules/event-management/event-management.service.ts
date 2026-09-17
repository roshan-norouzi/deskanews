import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  eventMatchesCalendarCell,
  formatGregorianLabel,
  formatJalaliLabel,
  getIranWeekday,
  getLunarDateParts,
  toJalaliParts,
} from '@deska/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateAgendaItemDto,
  CreateBudgetItemDto,
  CreateEventManagementProjectDto,
  CreateEventManagementTaskDto,
  DateAssessmentDto,
  OpportunityAssessmentDto,
  UpdateEventManagementProjectDto,
  UpdateEventManagementTaskDto,
  UpdateBudgetItemDto,
} from './dto/event-management.dto';
import {
  assessmentCriteria,
  budgetCategories,
  getChecklistTemplate,
  type EventManagementType,
} from './event-management.templates';

const DAY_MS = 86_400_000;
const RISK_RANK: Record<string, number> = { green: 0, yellow: 1, orange: 2, red: 3 };

@Injectable()
export class EventManagementService {
  constructor(private readonly prisma: PrismaService) {}

  tools() {
    return {
      types: [
        { id: 'event', label: 'برنامه‌ریزی رویداد', description: 'آزمون ضرورت، طراحی تجربه، دعوت، سناریوی اجرا و ارزیابی' },
        { id: 'press_conference', label: 'نشست خبری', description: 'ارزش خبری، خانه پیام، سؤال‌های سخت، بسته رسانه‌ای و رصد پوشش' },
        { id: 'media_visit', label: 'بازدید رسانه‌ای', description: 'تصمیم برو/نرو، مسیر روایت، ایمنی، رضایت تصویربرداری و پیگیری رسانه' },
        { id: 'exhibition', label: 'حضور نمایشگاهی', description: 'اعتبارسنجی، بریف غرفه، تیم، ثبت لید و ارزیابی حضور' },
        { id: 'sponsorship', label: 'حمایت مالی', description: 'امتیازدهی فرصت، مذاکره دارایی‌ها، فعال‌سازی و سنجش بازده' },
      ],
      assessmentCriteria,
    };
  }

  list(tenantId: string, type?: string, status?: string) {
    return this.prisma.eventManagementProject.findMany({
      where: { tenantId, ...(type ? { type } : {}), ...(status ? { status } : {}) },
      include: {
        _count: { select: { tasks: true, agendaItems: true, budgetItems: true } },
        tasks: { select: { status: true } },
      },
      orderBy: [{ startAt: 'asc' }, { updatedAt: 'desc' }],
    });
  }

  async findOne(tenantId: string, id: string) {
    const project = await this.prisma.eventManagementProject.findFirst({
      where: { id, tenantId },
      include: {
        tasks: { orderBy: [{ phase: 'asc' }, { sortOrder: 'asc' }, { dueAt: 'asc' }] },
        agendaItems: { orderBy: [{ sortOrder: 'asc' }, { startAt: 'asc' }] },
        budgetItems: { orderBy: [{ sortOrder: 'asc' }, { category: 'asc' }] },
      },
    });
    if (!project) throw new NotFoundException('پرونده مدیریت رویداد یافت نشد');
    return project;
  }

  async create(tenantId: string, userId: string, data: CreateEventManagementProjectDto) {
    this.validateRange(data.startAt, data.endAt);
    const project = await this.prisma.eventManagementProject.create({
      data: {
        tenantId,
        title: data.title.trim(),
        type: data.type,
        status: data.status ?? 'draft',
        objective: data.objective.trim(),
        organizationProfile: data.organizationProfile ?? 'private_company',
        mode: data.mode ?? 'in_person',
        startAt: data.startAt ? new Date(data.startAt) : undefined,
        endAt: data.endAt ? new Date(data.endAt) : undefined,
        location: data.location?.trim(),
        targetAudience: data.targetAudience?.trim(),
        ownerId: data.ownerId,
        approvedBudget: data.approvedBudget,
        details: (data.details ?? {}) as Prisma.InputJsonValue,
        createdById: userId,
      },
    });
    await this.syncCalendarEvent(project);
    return project;
  }

  async update(tenantId: string, id: string, data: UpdateEventManagementProjectDto) {
    const current = await this.findProject(tenantId, id);
    this.validateRange(data.startAt ?? current.startAt, data.endAt ?? current.endAt);
    const project = await this.prisma.eventManagementProject.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title.trim() } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.objective !== undefined ? { objective: data.objective.trim() } : {}),
        ...(data.organizationProfile !== undefined ? { organizationProfile: data.organizationProfile } : {}),
        ...(data.mode !== undefined ? { mode: data.mode } : {}),
        ...(data.startAt !== undefined ? { startAt: new Date(data.startAt) } : {}),
        ...(data.endAt !== undefined ? { endAt: new Date(data.endAt) } : {}),
        ...(data.location !== undefined ? { location: data.location.trim() } : {}),
        ...(data.targetAudience !== undefined ? { targetAudience: data.targetAudience.trim() } : {}),
        ...(data.ownerId !== undefined ? { ownerId: data.ownerId } : {}),
        ...(data.approvedBudget !== undefined ? { approvedBudget: data.approvedBudget } : {}),
        ...(data.actualCost !== undefined ? { actualCost: data.actualCost } : {}),
        ...(data.details !== undefined ? { details: data.details as Prisma.InputJsonValue } : {}),
      },
    });
    await this.syncCalendarEvent(project);
    return this.findOne(tenantId, id);
  }

  async remove(tenantId: string, id: string) {
    await this.findProject(tenantId, id);
    await this.prisma.$transaction([
      this.prisma.calendarEvent.deleteMany({ where: { tenantId, entityType: 'event_management_project', entityId: id } }),
      this.prisma.eventManagementProject.delete({ where: { id } }),
    ]);
    return { id, deleted: true };
  }

  async generateChecklist(tenantId: string, id: string, replace = false) {
    const project = await this.findProject(tenantId, id);
    if (!project.startAt) throw new BadRequestException('برای ساخت چک‌لیست زمان‌دار، ابتدا تاریخ اجرا را تعیین کنید');
    const projectStartAt = project.startAt;
    const type = project.type as EventManagementType;
    const template = getChecklistTemplate(type);
    const existingCount = await this.prisma.eventManagementTask.count({ where: { tenantId, projectId: id } });
    if (existingCount && !replace) throw new BadRequestException('چک‌لیست قبلاً ساخته شده است؛ برای بازسازی گزینه جایگزینی را فعال کنید');

    await this.prisma.$transaction(async (tx) => {
      if (replace) await tx.eventManagementTask.deleteMany({ where: { tenantId, projectId: id } });
      await tx.eventManagementTask.createMany({
        data: template.map((item, index) => ({
          tenantId,
          projectId: id,
          phase: item.phase,
          title: item.title,
          deliverable: item.deliverable,
          required: item.required ?? false,
          dueAt: new Date(projectStartAt.getTime() - item.offsetDays * DAY_MS),
          sortOrder: index,
        })),
      });

      const budgetCount = await tx.eventManagementBudgetItem.count({ where: { tenantId, projectId: id } });
      if (!budgetCount) {
        await tx.eventManagementBudgetItem.createMany({
          data: budgetCategories[type].map((category, index) => ({ tenantId, projectId: id, category, description: category, sortOrder: index })),
        });
      }

      const agendaCount = await tx.eventManagementAgendaItem.count({ where: { tenantId, projectId: id } });
      if (!agendaCount && type !== 'sponsorship') {
        const base = projectStartAt.getTime();
        const agenda = this.defaultAgenda(type);
        await tx.eventManagementAgendaItem.createMany({
          data: agenda.map((item, index) => ({
            tenantId,
            projectId: id,
            title: item.title,
            durationMinutes: item.duration,
            startAt: new Date(base + item.offset * 60_000),
            ownerName: item.owner,
            technicalNotes: item.notes,
            sortOrder: index,
          })),
        });
      }
    });
    return this.findOne(tenantId, id);
  }

  async addTask(tenantId: string, projectId: string, data: CreateEventManagementTaskDto) {
    await this.findProject(tenantId, projectId);
    return this.prisma.eventManagementTask.create({
      data: {
        tenantId, projectId, phase: data.phase.trim(), title: data.title.trim(), deliverable: data.deliverable?.trim(),
        ownerName: data.ownerName?.trim(), dueAt: data.dueAt ? new Date(data.dueAt) : undefined,
        status: data.status ?? 'todo', required: data.required ?? false, sortOrder: data.sortOrder ?? 0, notes: data.notes?.trim(),
      },
    });
  }

  async updateTask(tenantId: string, id: string, data: UpdateEventManagementTaskDto) {
    const task = await this.prisma.eventManagementTask.findFirst({ where: { id, tenantId } });
    if (!task) throw new NotFoundException('وظیفه مدیریت رویداد یافت نشد');
    return this.prisma.eventManagementTask.update({
      where: { id },
      data: {
        ...(data.phase !== undefined ? { phase: data.phase.trim() } : {}),
        ...(data.title !== undefined ? { title: data.title.trim() } : {}),
        ...(data.deliverable !== undefined ? { deliverable: data.deliverable.trim() } : {}),
        ...(data.ownerName !== undefined ? { ownerName: data.ownerName.trim() } : {}),
        ...(data.dueAt !== undefined ? { dueAt: new Date(data.dueAt) } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.required !== undefined ? { required: data.required } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.notes !== undefined ? { notes: data.notes.trim() } : {}),
      },
    });
  }

  async addAgendaItem(tenantId: string, projectId: string, data: CreateAgendaItemDto) {
    await this.findProject(tenantId, projectId);
    return this.prisma.eventManagementAgendaItem.create({
      data: { tenantId, projectId, title: data.title.trim(), durationMinutes: data.durationMinutes, startAt: data.startAt ? new Date(data.startAt) : undefined, ownerName: data.ownerName?.trim(), onlineAction: data.onlineAction?.trim(), technicalNotes: data.technicalNotes?.trim(), sortOrder: data.sortOrder ?? 0 },
    });
  }

  async addBudgetItem(tenantId: string, projectId: string, data: CreateBudgetItemDto) {
    await this.findProject(tenantId, projectId);
    const quantity = data.quantity ?? 1;
    const unitCost = data.unitCost ?? 0;
    return this.prisma.eventManagementBudgetItem.create({
      data: { tenantId, projectId, category: data.category.trim(), description: data.description.trim(), quantity, unitCost, estimatedAmount: data.estimatedAmount ?? quantity * unitCost, actualAmount: data.actualAmount, notes: data.notes?.trim(), sortOrder: data.sortOrder ?? 0 },
    });
  }

  async updateBudgetItem(tenantId: string, id: string, data: UpdateBudgetItemDto) {
    const item = await this.prisma.eventManagementBudgetItem.findFirst({ where: { id, tenantId } });
    if (!item) throw new NotFoundException('ردیف بودجه یافت نشد');
    return this.prisma.eventManagementBudgetItem.update({
      where: { id },
      data: {
        ...(data.category !== undefined ? { category: data.category.trim() } : {}),
        ...(data.description !== undefined ? { description: data.description.trim() } : {}),
        ...(data.estimatedAmount !== undefined ? { estimatedAmount: data.estimatedAmount } : {}),
        ...(data.actualAmount !== undefined ? { actualAmount: data.actualAmount } : {}),
        ...(data.notes !== undefined ? { notes: data.notes.trim() } : {}),
      },
    });
  }

  assessOpportunity(data: OpportunityAssessmentDto) {
    const type = data.type as EventManagementType;
    const criteria = assessmentCriteria[type];
    const normalized = criteria.map((criterion) => {
      const value = Number(data.scores[criterion.key]);
      if (!Number.isFinite(value) || value < 1 || value > 5) throw new BadRequestException(`امتیاز «${criterion.label}» باید بین ۱ تا ۵ باشد`);
      return { ...criterion, value, weighted: value * criterion.weight };
    });
    const maximum = normalized.reduce((sum, item) => sum + item.weight * 5, 0);
    const achieved = normalized.reduce((sum, item) => sum + item.weighted, 0);
    const percent = Math.round((achieved / maximum) * 100);
    const vetoes = normalized.filter((item) => item.veto && item.value < 2).map((item) => item.label);
    const recommendation = vetoes.length > 0 || percent < 50 ? 'do_not_proceed' : percent <= 70 ? 'conditional' : 'proceed';
    return { type, percent, achieved, maximum, vetoes, recommendation, criteria: normalized };
  }

  async assessDate(tenantId: string, data: DateAssessmentDto) {
    const target = this.parseDate(data.targetDate);
    if (data.projectId) await this.findProject(tenantId, data.projectId);
    const observances = await this.prisma.systemCalendarObservance.findMany({
      where: { isActive: true },
      orderBy: { startAt: 'asc' },
    });
    const assessment = this.calculateDateAssessment(target, observances);
    const result = { ...assessment, type: data.type, objective: data.objective?.trim() ?? '', flexible: data.flexible ?? true };
    if (data.projectId) {
      await this.prisma.eventManagementProject.update({
        where: { id: data.projectId },
        data: { calendarRisk: result.level, calendarAssessment: result as unknown as Prisma.InputJsonValue, calendarCheckedAt: new Date() },
      });
    }
    return result;
  }

  private calculateDateAssessment(target: Date, observances: Array<{ id: string; title: string; startAt: Date; recurrenceType: string; recurrenceCal: string; recurrenceRule: Prisma.JsonValue; isHoliday: boolean; source: string }>) {
    const cellFor = (date: Date) => {
      const gy = date.getFullYear(); const gm = date.getMonth() + 1; const gd = date.getDate();
      return { gregorian: { gy, gm, gd }, jalali: toJalaliParts(gy, gm, gd), iranWeekday: getIranWeekday(gy, gm, gd), isOutsideMonth: false };
    };
    const targetCell = cellFor(target);
    const matched = new Map<string, { title: string; isHoliday: boolean; source: string; exact: boolean; lunar: boolean }>();
    for (const delta of [-1, 0, 1]) {
      const date = new Date(target.getTime() + delta * DAY_MS);
      const cell = cellFor(date);
      for (const item of observances) {
        const matches = eventMatchesCalendarCell(item.startAt.toISOString(), cell, 'jalali', item.recurrenceType, item.recurrenceCal, item.recurrenceRule);
        if (!matches) continue;
        const existing = matched.get(item.id);
        matched.set(item.id, { title: item.title, isHoliday: item.isHoliday, source: item.source, exact: delta === 0 || existing?.exact === true, lunar: item.recurrenceCal === 'lunar' });
      }
    }
    const conflicts = [...matched.values()];
    const warnings: string[] = [];
    let level = 'green';
    const raise = (risk: string, warning: string) => { if (RISK_RANK[risk] > RISK_RANK[level]) level = risk; warnings.push(warning); };
    const mourning = /عاشورا|تاسوعا|اربعین|شهادت|رحلت|سوگ|وفات|محرم/i;
    for (const conflict of conflicts) {
      if (conflict.exact && (conflict.isHoliday || mourning.test(conflict.title))) raise('red', `هم‌زمان با «${conflict.title}» است.`);
      else if (conflict.lunar) raise('orange', `در بازه احتیاط ±۱ روز مناسبت قمری «${conflict.title}» قرار دارد.`);
      else if (conflict.exact) raise('yellow', `با مناسبت «${conflict.title}» هم‌زمان است.`);
    }
    if (targetCell.iranWeekday === 6) raise('orange', 'تاریخ انتخابی جمعه است؛ دسترسی مهمانان سازمانی و رسانه‌ها محدودتر است.');
    else if (targetCell.iranWeekday === 5) raise('yellow', 'پنج‌شنبه برای مخاطب سازمانی و رسانه‌ای معمولاً بازده کمتری دارد.');
    const { jm, jd } = targetCell.jalali;
    if ((jm === 12 && jd >= 25) || (jm === 1 && jd <= 15)) raise('orange', 'تاریخ در بازه کم‌اثر نوروزی ۲۵ اسفند تا ۱۵ فروردین است.');
    const lunar = getLunarDateParts(target);
    return {
      level,
      targetDate: target.toISOString(),
      calendars: {
        jalali: formatJalaliLabel(targetCell.jalali, true),
        gregorian: formatGregorianLabel(targetCell.gregorian, true),
        lunar: `${lunar.day}/${lunar.month}/${lunar.year}`,
      },
      weekday: targetCell.iranWeekday,
      warnings,
      conflicts,
      recommendation: level === 'red' ? 'تغییر تاریخ توصیه می‌شود؛ اگر ناگزیر است، لحن و قالب برنامه باید با مناسبت سازگار شود.' : level === 'orange' ? 'تاریخ پرریسک است؛ پیش از تثبیت، گزینه‌های نزدیک را مقایسه کنید.' : level === 'yellow' ? 'تاریخ قابل استفاده است اما ملاحظه ثبت‌شده باید مدیریت شود.' : 'در داده‌های فعلی مانع تقویمی آشکاری یافت نشد.',
      source: 'تقویم مناسبت‌های سیستمی DESKA',
      checkedAt: new Date().toISOString(),
      disclaimer: 'تاریخ قمری محاسباتی است و ممکن است با رؤیت رسمی هلال ±۱ روز اختلاف داشته باشد؛ برای تصمیم نهایی منبع رسمی روز را کنترل کنید.',
    };
  }

  private async syncCalendarEvent(project: { id: string; tenantId: string; title: string; objective: string; startAt: Date | null; endAt: Date | null; location: string | null }) {
    const existing = await this.prisma.calendarEvent.findFirst({ where: { tenantId: project.tenantId, entityType: 'event_management_project', entityId: project.id } });
    if (!project.startAt) {
      if (existing) await this.prisma.calendarEvent.delete({ where: { id: existing.id } });
      return;
    }
    const data = { title: project.title, description: project.objective, startAt: project.startAt, endAt: project.endAt ?? new Date(project.startAt.getTime() + 2 * 60 * 60 * 1000), allDay: false, location: project.location, color: '#7c3aed', entityType: 'event_management_project', entityId: project.id };
    if (existing) await this.prisma.calendarEvent.update({ where: { id: existing.id }, data });
    else await this.prisma.calendarEvent.create({ data: { ...data, tenantId: project.tenantId } });
  }

  private async findProject(tenantId: string, id: string) {
    const project = await this.prisma.eventManagementProject.findFirst({ where: { id, tenantId } });
    if (!project) throw new NotFoundException('پرونده مدیریت رویداد یافت نشد');
    return project;
  }

  private parseDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('تاریخ معتبر نیست');
    return date;
  }

  private validateRange(start?: string | Date | null, end?: string | Date | null) {
    if (!start || !end) return;
    if (new Date(end) < new Date(start)) throw new BadRequestException('زمان پایان باید بعد از زمان شروع باشد');
  }

  private defaultAgenda(type: EventManagementType) {
    if (type === 'media_visit') return [
      { offset: -60, duration: 30, title: 'استقرار و شمارش اول', owner: 'مسئول شمارش', notes: 'فهرست چاپی و تماس اضطراری' },
      { offset: -30, duration: 30, title: 'توجیه ایمنی و حرکت', owner: 'مدیر بازدید', notes: 'فرم ایمنی و تجهیزات' },
      { offset: 0, duration: 90, title: 'مسیر روایت و توقف‌ها', owner: 'راهنمای فنی', notes: 'شمارش در هر توقف' },
      { offset: 90, duration: 25, title: 'نقطه اوج و تصویربرداری', owner: 'مسئول رسانه', notes: 'زاویه عکاسی از قبل کنترل شود' },
      { offset: 115, duration: 20, title: 'زمان آزاد در محدوده امن', owner: 'مسئول ایمنی', notes: 'نظارت غیرمزاحم' },
      { offset: 135, duration: 30, title: 'پرسش و پاسخ و ثبت تعهدات', owner: 'سخنگو', notes: 'هیچ سؤال بی‌مالک نماند' },
    ];
    if (type === 'exhibition') return [
      { offset: -60, duration: 45, title: 'تحویل شیفت و کنترل غرفه', owner: 'مدیر غرفه', notes: 'برق، نمایشگر، اقلام و فرم لید' },
      { offset: 0, duration: 240, title: 'پذیرش، دمو و ثبت لید', owner: 'تیم غرفه', notes: 'ثبت در لحظه' },
      { offset: 240, duration: 30, title: 'محتوای روز و مصاحبه‌ها', owner: 'مسئول رسانه', notes: 'فهرست شات' },
      { offset: 270, duration: 15, title: 'جمع‌بندی روزانه', owner: 'مدیر پروژه', notes: 'لیدها، کمبودها و برنامه فردا' },
    ];
    return [
      { offset: -120, duration: 60, title: 'استقرار و تست کامل فنی', owner: 'مسئول فنی', notes: 'تست با گوینده واقعی' },
      { offset: -60, duration: 30, title: 'بریفینگ عوامل و سخنرانان', owner: 'مدیر برنامه', notes: 'مرور زمان و سناریوی جایگزین' },
      { offset: -30, duration: 30, title: 'پذیرش مهمانان و رسانه', owner: 'مسئول ثبت‌نام', notes: 'مسیر ویژه رسانه و مهمان ارشد' },
      { offset: 0, duration: 10, title: 'آغاز و پیام مادر', owner: 'مجری', notes: 'سمت‌ها دقیق خوانده شود' },
      { offset: 10, duration: 25, title: type === 'press_conference' ? 'بیانیه اصلی' : 'بخش محتوایی اصلی', owner: 'سخنگو', notes: 'سقف زمان رعایت شود' },
      { offset: 35, duration: 25, title: 'پرسش و پاسخ', owner: 'مجری', notes: 'ثبت سؤالات بی‌پاسخ' },
      { offset: 60, duration: 30, title: 'گفتگو و مصاحبه‌های اختصاصی', owner: 'مسئول رسانه', notes: 'ضبط و آرشیو' },
      { offset: 90, duration: 30, title: 'جمع‌آوری و ارسال خروجی', owner: 'مدیر برنامه', notes: 'خبر و عکس حداکثر دو ساعت بعد' },
    ];
  }
}
