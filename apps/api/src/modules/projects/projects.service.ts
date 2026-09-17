import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateChecklistItemDto,
  CreateProjectDto,
  CreateTaskDto,
  DecideApprovalDto,
  UpdateProjectDto,
  UpdateTaskDto,
} from './dto/projects.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  list(tenantId: string) {
    return this.prisma.project.findMany({
      where: { tenantId },
      include: { _count: { select: { tasks: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  create(tenantId: string, data: CreateProjectDto) {
    return this.prisma.project.create({
      data: {
        tenantId,
        name: data.name.trim(),
        description: data.description?.trim(),
        status: data.status ?? 'active',
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      },
    });
  }

  async update(tenantId: string, id: string, data: UpdateProjectDto) {
    const result = await this.prisma.project.updateMany({
      where: { id, tenantId },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.description !== undefined ? { description: data.description.trim() } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.startDate !== undefined ? { startDate: new Date(data.startDate) } : {}),
        ...(data.dueDate !== undefined ? { dueDate: new Date(data.dueDate) } : {}),
      },
    });
    if (!result.count) throw new NotFoundException('پروژه یافت نشد');
    return this.prisma.project.findFirst({ where: { id, tenantId } });
  }

  async tasks(tenantId: string, projectId?: string) {
    if (projectId) await this.assertProject(tenantId, projectId);
    return this.prisma.task.findMany({
      where: { tenantId, ...(projectId ? { projectId } : {}) },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
    });
  }

  async createTask(tenantId: string, data: CreateTaskDto) {
    if (data.projectId) await this.assertProject(tenantId, data.projectId);
    if (data.assigneeId) await this.assertMember(tenantId, data.assigneeId);
    return this.prisma.task.create({
      data: {
        tenantId,
        projectId: data.projectId,
        title: data.title.trim(),
        description: data.description?.trim(),
        status: data.status ?? 'todo',
        priority: data.priority ?? 'normal',
        assigneeId: data.assigneeId,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      },
    });
  }

  async updateTask(tenantId: string, id: string, data: UpdateTaskDto) {
    const task = await this.prisma.task.findFirst({ where: { id, tenantId } });
    if (!task) throw new NotFoundException('تسک یافت نشد');
    if (data.projectId) await this.assertProject(tenantId, data.projectId);
    if (data.assigneeId) await this.assertMember(tenantId, data.assigneeId);
    return this.prisma.task.update({
      where: { id },
      data: {
        ...(data.projectId !== undefined ? { projectId: data.projectId } : {}),
        ...(data.title !== undefined ? { title: data.title.trim() } : {}),
        ...(data.description !== undefined ? { description: data.description.trim() } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        ...(data.assigneeId !== undefined ? { assigneeId: data.assigneeId } : {}),
        ...(data.dueDate !== undefined ? { dueDate: new Date(data.dueDate) } : {}),
      },
    });
  }

  async addChecklist(tenantId: string, taskId: string, data: CreateChecklistItemDto) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, tenantId } });
    if (!task) throw new NotFoundException('تسک یافت نشد');
    return this.prisma.checklistItem.create({
      data: { taskId, title: data.title.trim(), sortOrder: data.sortOrder ?? 0 },
    });
  }

  async toggleChecklist(tenantId: string, id: string, isDone: boolean) {
    const result = await this.prisma.checklistItem.updateMany({
      where: { id, task: { tenantId } },
      data: { isDone },
    });
    if (!result.count) throw new NotFoundException('مورد چک‌لیست یافت نشد');
    return { id, isDone };
  }

  listApprovals(tenantId: string, taskId: string) {
    return this.prisma.approvalStep.findMany({
      where: { taskId, task: { tenantId } },
      orderBy: { stepOrder: 'asc' },
    });
  }

  async decideApproval(tenantId: string, userId: string, id: string, data: DecideApprovalDto) {
    const result = await this.prisma.approvalStep.updateMany({
      where: { id, approverId: userId, task: { tenantId } },
      data: { status: data.status, comment: data.comment?.trim(), decidedAt: new Date() },
    });
    if (!result.count) throw new NotFoundException('تأییدیه مجاز یافت نشد');
    return this.prisma.approvalStep.findUnique({ where: { id } });
  }

  private async assertProject(tenantId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, tenantId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('پروژه یافت نشد');
  }

  private async assertMember(tenantId: string, userId: string) {
    const member = await this.prisma.tenantMember.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { userId: true },
    });
    if (!member) throw new NotFoundException('عضو سازمان یافت نشد');
  }
}
