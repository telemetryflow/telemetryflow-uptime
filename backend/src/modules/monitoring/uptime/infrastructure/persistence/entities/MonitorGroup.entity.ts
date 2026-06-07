import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("uptime_monitor_groups")
@Index(["organizationId"])
@Index(["organizationId", "displayOrder"])
export class MonitorGroupEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ length: 255 })
  name: string;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({ name: "display_order", default: 0 })
  displayOrder: number;

  @Column({ name: "is_expanded", default: true })
  isExpanded: boolean;

  @Column({ name: "monitor_ids", type: "jsonb", default: "[]" })
  monitorIds: string[];

  @Column({ name: "organization_id", type: "uuid" })
  organizationId: string;

  @Column({ name: "workspace_id", type: "uuid", nullable: true })
  workspaceId: string;

  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
