import { MonitorGroup } from "../../domain/aggregates/MonitorGroup";
import { MonitorGroupEntity } from "./entities/MonitorGroup.entity";

export class MonitorGroupMapper {
  static toDomain(entity: MonitorGroupEntity): MonitorGroup {
    return MonitorGroup.reconstitute({
      id: entity.id,
      name: entity.name,
      description: entity.description,
      displayOrder: entity.displayOrder,
      isExpanded: entity.isExpanded,
      monitorIds: entity.monitorIds || [],
      organizationId: entity.organizationId,
      workspaceId: entity.workspaceId,
      metadata: entity.metadata,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  static toEntity(group: MonitorGroup): Partial<MonitorGroupEntity> {
    const props = group.toJSON();

    return {
      id: props.id,
      name: props.name,
      description: props.description,
      displayOrder: props.displayOrder,
      isExpanded: props.isExpanded,
      monitorIds: props.monitorIds,
      organizationId: props.organizationId,
      workspaceId: props.workspaceId,
      metadata: props.metadata,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    };
  }
}
