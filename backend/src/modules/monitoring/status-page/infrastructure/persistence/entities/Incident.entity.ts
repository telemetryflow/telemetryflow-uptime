import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';
import { IncidentImpact, IncidentStatus } from '../../../domain/aggregates/Incident';

@Entity('status_page_incidents')
@Index(['statusPageId'])
@Index(['statusPageId', 'status'])
@Index(['organizationId'])
@Index(['startedAt'])
@Index(['isScheduledMaintenance'])
export class IncidentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'status_page_id', type: 'uuid' })
  statusPageId: string;

  @Column({ length: 255 })
  title: string;

  @Column({ type: 'enum', enum: IncidentImpact, default: IncidentImpact.MINOR })
  impact: IncidentImpact;

  @Column({ type: 'enum', enum: IncidentStatus, default: IncidentStatus.INVESTIGATING })
  status: IncidentStatus;

  @Column({ type: 'text', nullable: true })
  message: string;

  @Column({ name: 'affected_monitor_ids', type: 'jsonb', default: '[]' })
  affectedMonitorIds: string[];

  @Column({ type: 'jsonb', default: '[]' })
  updates: Array<{
    id: string;
    status: IncidentStatus;
    message: string;
    createdBy?: string;
    createdAt: Date;
  }>;

  @Column({ name: 'is_scheduled_maintenance', default: false })
  isScheduledMaintenance: boolean;

  @Column({ name: 'scheduled_start_at', type: 'timestamptz', nullable: true })
  scheduledStartAt: Date;

  @Column({ name: 'scheduled_end_at', type: 'timestamptz', nullable: true })
  scheduledEndAt: Date;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'workspace_id', type: 'uuid', nullable: true })
  workspaceId: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date;
}
