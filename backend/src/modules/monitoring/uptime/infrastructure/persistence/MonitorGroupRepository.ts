import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { MonitorGroup } from "../../domain/aggregates/MonitorGroup";
import {
  IMonitorGroupRepository,
  MONITOR_GROUP_REPOSITORY,
} from "../../domain/repositories/IUptimeRepository";
import { MonitorGroupEntity } from "./entities/MonitorGroup.entity";
import { MonitorGroupMapper } from "./MonitorGroupMapper";

@Injectable()
export class MonitorGroupRepository implements IMonitorGroupRepository {
  constructor(
    @InjectRepository(MonitorGroupEntity)
    private readonly repository: Repository<MonitorGroupEntity>,
  ) {}

  async save(group: MonitorGroup): Promise<void> {
    const entity = MonitorGroupMapper.toEntity(group);
    await this.repository.save(entity);
  }

  async findById(id: string): Promise<MonitorGroup | null> {
    const entity = await this.repository.findOne({
      where: { id },
    });

    if (!entity) return null;
    return MonitorGroupMapper.toDomain(entity);
  }

  async findByOrganization(organizationId: string): Promise<MonitorGroup[]> {
    const entities = await this.repository.find({
      where: { organizationId },
      order: { displayOrder: "ASC", createdAt: "ASC" },
    });

    return entities.map((e) => MonitorGroupMapper.toDomain(e));
  }

  async findByWorkspace(workspaceId: string): Promise<MonitorGroup[]> {
    const entities = await this.repository.find({
      where: { workspaceId },
      order: { displayOrder: "ASC", createdAt: "ASC" },
    });

    return entities.map((e) => MonitorGroupMapper.toDomain(e));
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete({ id });
  }
}

export { MONITOR_GROUP_REPOSITORY };
