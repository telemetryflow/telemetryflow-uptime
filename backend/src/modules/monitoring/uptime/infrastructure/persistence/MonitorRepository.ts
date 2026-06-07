import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull, LessThanOrEqual } from "typeorm";
import {
  Monitor,
  MonitorStatus,
  MonitorType,
} from "../../domain/aggregates/Monitor";
import {
  IMonitorRepository,
  MONITOR_REPOSITORY,
} from "../../domain/repositories/IUptimeRepository";
import { MonitorEntity } from "./entities/Monitor.entity";
import { MonitorMapper } from "./MonitorMapper";

@Injectable()
export class MonitorRepository implements IMonitorRepository {
  constructor(
    @InjectRepository(MonitorEntity)
    private readonly repository: Repository<MonitorEntity>,
  ) {}

  async save(monitor: Monitor): Promise<void> {
    const entity = MonitorMapper.toEntity(monitor);
    console.log('[MonitorRepository] Saving entity:', {
      id: entity.id,
      name: entity.name,
      url: entity.url,
      updatedAt: entity.updatedAt,
    });
    await this.repository.save(entity);
    console.log('[MonitorRepository] Entity saved successfully');
  }

  async findById(id: string): Promise<Monitor | null> {
    const entity = await this.repository.findOne({
      where: { id, deletedAt: IsNull() },
    });

    if (!entity) return null;
    return MonitorMapper.toDomain(entity);
  }

  async findByOrganization(organizationId: string): Promise<Monitor[]> {
    const entities = await this.repository.find({
      where: { organizationId, deletedAt: IsNull() },
      order: { createdAt: "DESC" },
    });

    return entities.map((e) => MonitorMapper.toDomain(e));
  }

  async findByWorkspace(workspaceId: string): Promise<Monitor[]> {
    const entities = await this.repository.find({
      where: { workspaceId, deletedAt: IsNull() },
      order: { createdAt: "DESC" },
    });

    return entities.map((e) => MonitorMapper.toDomain(e));
  }

  async findByGroup(groupId: string): Promise<Monitor[]> {
    const entities = await this.repository.find({
      where: { groupId, deletedAt: IsNull() },
      order: { createdAt: "DESC" },
    });

    return entities.map((e) => MonitorMapper.toDomain(e));
  }

  async findByStatus(
    status: MonitorStatus,
    organizationId?: string,
  ): Promise<Monitor[]> {
    const where: Record<string, unknown> = { status, deletedAt: IsNull() };
    if (organizationId) {
      where.organizationId = organizationId;
    }

    const entities = await this.repository.find({
      where,
      order: { createdAt: "DESC" },
    });

    return entities.map((e) => MonitorMapper.toDomain(e));
  }

  async findByType(
    type: MonitorType,
    organizationId?: string,
  ): Promise<Monitor[]> {
    const where: Record<string, unknown> = { type, deletedAt: IsNull() };
    if (organizationId) {
      where.organizationId = organizationId;
    }

    const entities = await this.repository.find({
      where,
      order: { createdAt: "DESC" },
    });

    return entities.map((e) => MonitorMapper.toDomain(e));
  }

  async findActive(organizationId?: string): Promise<Monitor[]> {
    const where: Record<string, unknown> = {
      isActive: true,
      isPaused: false,
      deletedAt: IsNull(),
    };
    if (organizationId) {
      where.organizationId = organizationId;
    }

    const entities = await this.repository.find({
      where,
      order: { createdAt: "DESC" },
    });

    return entities.map((e) => MonitorMapper.toDomain(e));
  }

  async findDueForCheck(): Promise<Monitor[]> {
    const now = new Date();

    const entities = await this.repository.find({
      where: {
        isActive: true,
        isPaused: false,
        deletedAt: IsNull(),
        nextCheckAt: LessThanOrEqual(now),
      },
      order: { nextCheckAt: "ASC" },
    });

    return entities.map((e) => MonitorMapper.toDomain(e));
  }

  async delete(id: string): Promise<void> {
    await this.repository.update({ id }, { deletedAt: new Date() });
  }

  async count(organizationId?: string): Promise<number> {
    const where: Record<string, unknown> = { deletedAt: IsNull() };
    if (organizationId) {
      where.organizationId = organizationId;
    }

    return this.repository.count({ where });
  }
}

export { MONITOR_REPOSITORY };
