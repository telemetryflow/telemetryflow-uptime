import { UptimeCheck } from "../../domain/aggregates/UptimeCheck";
import { UptimeCheckEntity } from "./entities/UptimeCheck.entity";

export class UptimeCheckMapper {
  static toDomain(entity: UptimeCheckEntity): UptimeCheck {
    return UptimeCheck.reconstitute({
      id: entity.id,
      monitorId: entity.monitorId,
      status: entity.status,
      statusCode: entity.statusCode,
      responseTime: entity.responseTime,
      timing: entity.timing,
      message: entity.message,
      error: entity.error,
      sslInfo: entity.sslInfo
        ? {
            ...entity.sslInfo,
            validFrom: entity.sslInfo.validFrom
              ? new Date(entity.sslInfo.validFrom)
              : undefined,
            validTo: entity.sslInfo.validTo
              ? new Date(entity.sslInfo.validTo)
              : undefined,
          }
        : undefined,
      responseBody: entity.responseBody,
      responseHeaders: entity.responseHeaders,
      ipAddress: entity.ipAddress,
      region: entity.region,
      checkedAt: entity.checkedAt,
    });
  }

  static toEntity(check: UptimeCheck): Partial<UptimeCheckEntity> {
    const props = check.toJSON();

    return {
      id: props.id,
      monitorId: props.monitorId,
      status: props.status,
      statusCode: props.statusCode,
      responseTime: props.responseTime,
      timing: props.timing,
      message: props.message,
      error: props.error,
      sslInfo: props.sslInfo
        ? {
            ...props.sslInfo,
            validFrom: props.sslInfo.validFrom,
            validTo: props.sslInfo.validTo,
          }
        : undefined,
      responseBody: props.responseBody,
      responseHeaders: props.responseHeaders,
      ipAddress: props.ipAddress,
      region: props.region,
      checkedAt: props.checkedAt,
    };
  }
}
