import { Incident, IncidentUpdate } from '../../domain/aggregates/Incident';
import { IncidentEntity } from './entities/Incident.entity';

export class IncidentMapper {
  static toDomain(entity: IncidentEntity): Incident {
    // Convert updates from entity format to domain format
    const updates: IncidentUpdate[] = (entity.updates || []).map((update) => ({
      id: update.id,
      status: update.status,
      message: update.message,
      createdBy: update.createdBy,
      createdAt: new Date(update.createdAt),
    }));

    return Incident.reconstitute({
      id: entity.id,
      statusPageId: entity.statusPageId,
      title: entity.title,
      impact: entity.impact,
      status: entity.status,
      message: entity.message,
      affectedMonitorIds: entity.affectedMonitorIds || [],
      updates,
      isScheduledMaintenance: entity.isScheduledMaintenance,
      scheduledStartAt: entity.scheduledStartAt,
      scheduledEndAt: entity.scheduledEndAt,
      startedAt: entity.startedAt,
      resolvedAt: entity.resolvedAt,
      organizationId: entity.organizationId,
      createdBy: entity.createdBy,
      metadata: entity.metadata,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }

  static toEntity(incident: Incident): Partial<IncidentEntity> {
    const props = incident.toJSON();

    return {
      id: props.id,
      statusPageId: props.statusPageId,
      title: props.title,
      impact: props.impact,
      status: props.status,
      message: props.message,
      affectedMonitorIds: props.affectedMonitorIds,
      updates: props.updates.map((update) => ({
        id: update.id,
        status: update.status,
        message: update.message,
        createdBy: update.createdBy,
        createdAt: update.createdAt,
      })),
      isScheduledMaintenance: props.isScheduledMaintenance,
      scheduledStartAt: props.scheduledStartAt,
      scheduledEndAt: props.scheduledEndAt,
      startedAt: props.startedAt,
      resolvedAt: props.resolvedAt,
      organizationId: props.organizationId,
      createdBy: props.createdBy,
      metadata: props.metadata,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    };
  }
}
