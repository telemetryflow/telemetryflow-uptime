import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";
import { CheckStatus } from "../../../domain/aggregates/UptimeCheck";

@Entity("uptime_checks")
@Index(["monitorId"])
@Index(["monitorId", "checkedAt"])
@Index(["monitorId", "status"])
@Index(["checkedAt"])
export class UptimeCheckEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ name: "monitor_id", type: "uuid" })
  monitorId: string;

  @Column({ type: "enum", enum: CheckStatus, default: CheckStatus.SUCCESS })
  status: CheckStatus;

  @Column({ name: "status_code", nullable: true })
  statusCode: number;

  @Column({ name: "response_time" })
  responseTime: number;

  @Column({ type: "jsonb", nullable: true })
  timing: {
    dnsLookup?: number;
    tcpConnection?: number;
    tlsHandshake?: number;
    firstByte?: number;
    contentTransfer?: number;
    total: number;
  };

  @Column({ type: "text", nullable: true })
  message: string;

  @Column({ type: "text", nullable: true })
  error: string;

  @Column({ name: "ssl_info", type: "jsonb", nullable: true })
  sslInfo: {
    valid: boolean;
    issuer?: string;
    subject?: string;
    validFrom?: Date;
    validTo?: Date;
    daysUntilExpiry?: number;
    protocol?: string;
    cipher?: string;
  };

  @Column({ name: "response_body", type: "text", nullable: true })
  responseBody: string;

  @Column({ name: "response_headers", type: "jsonb", nullable: true })
  responseHeaders: Record<string, string>;

  @Column({ name: "ip_address", length: 50, nullable: true })
  ipAddress: string;

  @Column({ length: 50, nullable: true })
  region: string;

  @Column({ name: "checked_at", type: "timestamptz" })
  checkedAt: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;
}
