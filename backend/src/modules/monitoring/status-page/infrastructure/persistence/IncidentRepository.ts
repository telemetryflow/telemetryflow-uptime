import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not, MoreThanOrEqual } from 'typeorm';
import { Incident, IncidentStatus, IncidentImpact } from '../../domain/aggregates/Incident';
import {
  IIncidentRepository,
  INCIDENT_REPOSITORY,
} from '../../domain/repositories/IStatusPageRepository';
import { IncidentEntity } from './entities/Incident.entity';
import { IncidentMapper } from './IncidentMapper';

@Injectable()
export class IncidentRepository implements IIncidentRepository {
  constructor(
    @InjectRepository(IncidentEntity)
    private readonly repository: Repository<IncidentEntity>,
  ) {}

  async save(incident: Incident): Promise<void> {
    const entity = IncidentMapper.toEntity(incident);
    await this.repository.save(entity);
  }

  async findById(id: string): Promise<Incident | null> {
    const entity = await this.repository.findOne({
      where: { id },
    });

    if (!entity) return null;
    return IncidentMapper.toDomain(entity);
  }

  async findByStatusPage(
    statusPageId: string,
    options?: { status?: IncidentStatus; impact?: IncidentImpact; limit?: number },
  ): Promise<Incident[]> {
    const queryBuilder = this.repository
      .createQueryBuilder('incident')
      .where('incident.status_page_id = :statusPageId', { statusPageId });

    if (options?.status) {
      queryBuilder.andWhere('incident.status = :status', { status: options.status });
    }

    if (options?.impact) {
      queryBuilder.andWhere('incident.impact = :impact', { impact: options.impact });
    }

    queryBuilder.orderBy('incident.started_at', 'DESC');

    if (options?.limit) {
      queryBuilder.take(options.limit);
    }

    const entities = await queryBuilder.getMany();
    return entities.map((e) => IncidentMapper.toDomain(e));
  }

  async findActive(statusPageId?: string): Promise<Incident[]> {
    const activeStatuses = [
      IncidentStatus.INVESTIGATING,
      IncidentStatus.IDENTIFIED,
      IncidentStatus.MONITORING,
      IncidentStatus.IN_PROGRESS,
    ];

    const queryBuilder = this.repository
      .createQueryBuilder('incident')
      .where('incident.status IN (:...statuses)', { statuses: activeStatuses });

    if (statusPageId) {
      queryBuilder.andWhere('incident.status_page_id = :statusPageId', { statusPageId });
    }

    queryBuilder.orderBy('incident.started_at', 'DESC');

    const entities = await queryBuilder.getMany();
    return entities.map((e) => IncidentMapper.toDomain(e));
  }

  async findScheduled(statusPageId?: string): Promise<Incident[]> {
    const queryBuilder = this.repository
      .createQueryBuilder('incident')
      .where('incident.is_scheduled_maintenance = :isMaintenance', { isMaintenance: true })
      .andWhere('incident.status = :status', { status: IncidentStatus.SCHEDULED })
      .andWhere('incident.scheduled_start_at >= :now', { now: new Date() });

    if (statusPageId) {
      queryBuilder.andWhere('incident.status_page_id = :statusPageId', { statusPageId });
    }

    queryBuilder.orderBy('incident.scheduled_start_at', 'ASC');

    const entities = await queryBuilder.getMany();
    return entities.map((e) => IncidentMapper.toDomain(e));
  }

  async findByMonitor(monitorId: string): Promise<Incident[]> {
    const entities = await this.repository
      .createQueryBuilder('incident')
      .where(':monitorId = ANY(incident.affected_monitor_ids)', { monitorId })
      .orderBy('incident.started_at', 'DESC')
      .getMany();

    return entities.map((e) => IncidentMapper.toDomain(e));
  }

  async findRecent(statusPageId: string, days: number): Promise<Incident[]> {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    const entities = await this.repository.find({
      where: {
        statusPageId,
        startedAt: MoreThanOrEqual(fromDate),
      },
      order: { startedAt: 'DESC' },
    });

    return entities.map((e) => IncidentMapper.toDomain(e));
  }

  async delete(id: string): Promise<void> {
    await this.repository.delete({ id });
  }
}

export { INCIDENT_REPOSITORY };
