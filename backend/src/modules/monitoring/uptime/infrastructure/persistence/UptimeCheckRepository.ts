import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, LessThan, Between } from "typeorm";
import { UptimeCheck, CheckStatus } from "../../domain/aggregates/UptimeCheck";
import {
  IUptimeCheckRepository,
  UPTIME_CHECK_REPOSITORY,
} from "../../domain/repositories/IUptimeRepository";
import { UptimeCheckEntity } from "./entities/UptimeCheck.entity";
import { UptimeCheckMapper } from "./UptimeCheckMapper";

@Injectable()
export class UptimeCheckRepository implements IUptimeCheckRepository {
  constructor(
    @InjectRepository(UptimeCheckEntity)
    private readonly repository: Repository<UptimeCheckEntity>,
  ) {}

  async save(check: UptimeCheck): Promise<void> {
    const entity = UptimeCheckMapper.toEntity(check);
    await this.repository.save(entity);
  }

  async saveBatch(checks: UptimeCheck[]): Promise<void> {
    const entities = checks.map((c) => UptimeCheckMapper.toEntity(c));
    await this.repository.save(entities);
  }

  async findById(id: string): Promise<UptimeCheck | null> {
    const entity = await this.repository.findOne({
      where: { id },
    });

    if (!entity) return null;
    return UptimeCheckMapper.toDomain(entity);
  }

  async findByMonitor(
    monitorId: string,
    options?: { from?: Date; to?: Date; limit?: number; status?: CheckStatus },
  ): Promise<UptimeCheck[]> {
    const queryBuilder = this.repository
      .createQueryBuilder("check")
      .where("check.monitor_id = :monitorId", { monitorId });

    if (options?.from && options?.to) {
      queryBuilder.andWhere("check.checked_at BETWEEN :from AND :to", {
        from: options.from,
        to: options.to,
      });
    } else if (options?.from) {
      queryBuilder.andWhere("check.checked_at >= :from", {
        from: options.from,
      });
    } else if (options?.to) {
      queryBuilder.andWhere("check.checked_at <= :to", { to: options.to });
    }

    if (options?.status) {
      queryBuilder.andWhere("check.status = :status", {
        status: options.status,
      });
    }

    queryBuilder.orderBy("check.checked_at", "DESC");

    if (options?.limit) {
      queryBuilder.take(options.limit);
    }

    const entities = await queryBuilder.getMany();
    return entities.map((e) => UptimeCheckMapper.toDomain(e));
  }

  async findLatestByMonitor(monitorId: string): Promise<UptimeCheck | null> {
    const entity = await this.repository.findOne({
      where: { monitorId },
      order: { checkedAt: "DESC" },
    });

    if (!entity) return null;
    return UptimeCheckMapper.toDomain(entity);
  }

  async getUptimePercentage(
    monitorId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    const result = await this.repository
      .createQueryBuilder("check")
      .select("COUNT(*)", "total")
      .addSelect(
        `COUNT(*) FILTER (WHERE check.status = '${CheckStatus.SUCCESS}')`,
        "success",
      )
      .where("check.monitor_id = :monitorId", { monitorId })
      .andWhere("check.checked_at BETWEEN :from AND :to", { from, to })
      .getRawOne();

    const total = parseInt(result?.total || "0", 10);
    const success = parseInt(result?.success || "0", 10);

    if (total === 0) return 0;
    return (success / total) * 100;
  }

  async getAverageResponseTime(
    monitorId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    const result = await this.repository
      .createQueryBuilder("check")
      .select("AVG(check.response_time)", "avgResponseTime")
      .where("check.monitor_id = :monitorId", { monitorId })
      .andWhere("check.checked_at BETWEEN :from AND :to", { from, to })
      .andWhere("check.status = :status", { status: CheckStatus.SUCCESS })
      .getRawOne();

    return parseFloat(result?.avgResponseTime || "0");
  }

  async getCheckCount(
    monitorId: string,
    from: Date,
    to: Date,
    status?: CheckStatus,
  ): Promise<number> {
    const queryBuilder = this.repository
      .createQueryBuilder("check")
      .where("check.monitor_id = :monitorId", { monitorId })
      .andWhere("check.checked_at BETWEEN :from AND :to", { from, to });

    if (status) {
      queryBuilder.andWhere("check.status = :status", { status });
    }

    return queryBuilder.getCount();
  }

  async deleteOlderThan(date: Date): Promise<number> {
    const result = await this.repository.delete({
      checkedAt: LessThan(date),
    });

    return result.affected || 0;
  }
}

export { UPTIME_CHECK_REPOSITORY };
