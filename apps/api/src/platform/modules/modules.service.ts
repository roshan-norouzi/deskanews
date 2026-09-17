import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  canDisableModule,
  canEnableModule,
  getEnabledDependents,
  getModuleDependencies,
  getCoreModuleIds,
  MODULE_CATALOG,
  MODULE_DOMAIN_LABELS,
  PLATFORM_PLANS,
} from '@deska/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ToggleModuleDto } from './dto/toggle-module.dto';

@Injectable()
export class ModulesService {
  constructor(private prisma: PrismaService) {}

  async listCatalog() {
    return MODULE_CATALOG.map((mod) => ({
      ...mod,
      domainLabel: MODULE_DOMAIN_LABELS[mod.domain] ?? mod.domain,
    }));
  }

  async listTenantModules(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        modules: {
          include: { module: true },
        },
      },
    });

    if (!tenant) {
      throw new NotFoundException('سازمان یافت نشد');
    }

    const enabledIds = tenant.modules
      .filter((tm: { enabled: boolean }) => tm.enabled)
      .map((tm: { moduleId: string }) => tm.moduleId);
    const effectiveEnabledIds = [...new Set([...enabledIds, ...getCoreModuleIds()])];

    const catalogById = Object.fromEntries(MODULE_CATALOG.map((mod) => [mod.id, mod]));

    const builtinModules = MODULE_CATALOG.map((catalogMod) => {
      const tenantMod = tenant.modules.find(
        (tm: { moduleId: string }) => tm.moduleId === catalogMod.id,
      );
      const isCore = 'isCore' in catalogMod ? catalogMod.isCore : false;
      const canEnable = isCore || canEnableModule(catalogMod.id, effectiveEnabledIds);
      const canDisable = isCore ? false : canDisableModule(catalogMod.id, effectiveEnabledIds);
      const missingDependencyIds = getModuleDependencies(catalogMod.id).filter(
        (depId) => !effectiveEnabledIds.includes(depId),
      );
      const blockingDependentIds = getEnabledDependents(catalogMod.id, effectiveEnabledIds);

      return {
        id: catalogMod.id,
        name: catalogMod.name,
        domain: catalogMod.domain,
        domainLabel: MODULE_DOMAIN_LABELS[catalogMod.domain] ?? catalogMod.domain,
        version: catalogMod.version,
        dependencies: [...catalogMod.dependencies],
        dependencyLabels: catalogMod.dependencies.map(
          (depId) => catalogById[depId]?.name ?? depId,
        ),
        missingDependencyLabels: missingDependencyIds.map(
          (depId) => catalogById[depId]?.name ?? depId,
        ),
        blockingDependentLabels: blockingDependentIds.map(
          (depId) => catalogById[depId]?.name ?? depId,
        ),
        isCore,
        enabled: isCore || (tenantMod?.enabled ?? false),
        canEnable,
        canDisable,
        settings: tenantMod?.settings ?? {},
      };
    });

    const installedPlugins = await this.prisma.moduleDefinition.findMany({
      where: { source: 'plugin' },
      orderBy: { name: 'asc' },
    });
    const pluginModules = installedPlugins.map((plugin) => {
      const tenantMod = tenant.modules.find((tm: { moduleId: string }) => tm.moduleId === plugin.id);
      const missingDependencyLabels = plugin.dependencies.filter((dependency) => !effectiveEnabledIds.includes(dependency));
      return {
        id: plugin.id,
        name: plugin.name,
        domain: plugin.domain,
        domainLabel: MODULE_DOMAIN_LABELS[plugin.domain] ?? plugin.domain,
        version: plugin.version,
        dependencies: [...plugin.dependencies],
        dependencyLabels: [...plugin.dependencies],
        missingDependencyLabels,
        blockingDependentLabels: [],
        isCore: false,
        enabled: tenantMod?.enabled ?? false,
        canEnable: missingDependencyLabels.length === 0,
        canDisable: true,
        settings: tenantMod?.settings ?? {},
      };
    });
    return [...builtinModules, ...pluginModules];
  }

  async toggleModule(tenantId: string, moduleId: string, dto: ToggleModuleDto) {
    const catalogMod = MODULE_CATALOG.find((m) => m.id === moduleId);
    const pluginMod = catalogMod
      ? null
      : await this.prisma.moduleDefinition.findFirst({ where: { id: moduleId, source: 'plugin' } });
    if (!catalogMod && !pluginMod) throw new NotFoundException('ماژول یافت نشد');
    if (pluginMod) {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, include: { modules: true } });
      if (!tenant) throw new NotFoundException('سازمان یافت نشد');
      const enabledIds = tenant.modules.filter((module) => module.enabled).map((module) => module.moduleId);
      const missing = pluginMod.dependencies.filter((dependency) => !enabledIds.includes(dependency) && !getCoreModuleIds().includes(dependency));
      if (dto.enabled && missing.length > 0) {
        throw new BadRequestException(`ابتدا وابستگی‌های افزونه را فعال کنید: ${missing.join('، ')}`);
      }
      const tenantModule = await this.prisma.tenantModule.upsert({
        where: { tenantId_moduleId: { tenantId, moduleId } },
        create: { tenantId, moduleId, enabled: dto.enabled },
        update: { enabled: dto.enabled },
      });
      return { id: moduleId, name: pluginMod.name, enabled: tenantModule.enabled, settings: tenantModule.settings };
    }
    if (!catalogMod) throw new NotFoundException('ماژول یافت نشد');

    const isCore = 'isCore' in catalogMod ? catalogMod.isCore : false;

    if (isCore && !dto.enabled) {
      throw new ForbiddenException('ماژول‌های هسته قابل غیرفعال‌سازی نیستند');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { modules: true },
    });

    if (!tenant) {
      throw new NotFoundException('سازمان یافت نشد');
    }

    const planModules = PLATFORM_PLANS[tenant.plan]?.modules ?? [];
    if (dto.enabled && !isCore && !planModules.includes(moduleId)) {
      throw new ForbiddenException('این ماژول در پلن فعلی سازمان موجود نیست');
    }

    const enabledIds = tenant.modules
      .filter((tm: { enabled: boolean }) => tm.enabled)
      .map((tm: { moduleId: string }) => tm.moduleId);
    const effectiveEnabledIds = [...new Set([...enabledIds, ...getCoreModuleIds()])];

    if (dto.enabled && !isCore && !canEnableModule(moduleId, effectiveEnabledIds)) {
      const deps = catalogMod.dependencies.filter((d) => !effectiveEnabledIds.includes(d));
      throw new BadRequestException(
        `برای فعال‌سازی این ماژول، ابتدا وابستگی‌های زیر را فعال کنید: ${deps.join(', ')}`,
      );
    }

    if (!dto.enabled && !isCore && !canDisableModule(moduleId, effectiveEnabledIds)) {
      const dependents = MODULE_CATALOG.filter(
        (m) =>
          (m.dependencies as readonly string[]).includes(moduleId) &&
          effectiveEnabledIds.includes(m.id),
      );

      throw new BadRequestException(
        `ابتدا ماژول‌های وابسته را غیرفعال کنید: ${dependents.map((d) => d.name).join(', ')}`,
      );
    }

    await this.prisma.moduleDefinition.upsert({
      where: { id: moduleId },
      create: {
        id: catalogMod.id,
        name: catalogMod.name,
        domain: catalogMod.domain,
        version: catalogMod.version,
        dependencies: [...catalogMod.dependencies],
        isCore,
      },
      update: {},
    });

    const tenantModule = await this.prisma.tenantModule.upsert({
      where: { tenantId_moduleId: { tenantId, moduleId } },
      create: {
        tenantId,
        moduleId,
        enabled: dto.enabled,
      },
      update: {
        enabled: dto.enabled,
      },
      include: { module: true },
    });

    return {
      id: tenantModule.moduleId,
      name: tenantModule.module.name,
      enabled: tenantModule.enabled,
      settings: tenantModule.settings,
    };
  }
}
