# Configuration Files

Configuration files for TelemetryFlow Uptime infrastructure services.

## Directory Structure

```
config/
├── clickhouse/          # ClickHouse configuration
│   ├── config.xml       # Server configuration
│   ├── users.xml        # User and access control
│   ├── migrations/      # Schema migrations
│   └── README.md
├── postgresql/          # PostgreSQL configuration
│   ├── postgresql.conf  # Server configuration
│   └── README.md
└── README.md
```

## Services

### ClickHouse
- **Port**: 8123 (HTTP), 9000 (Native)
- **Purpose**: Audit logs storage
- **Config**: `clickhouse/config.xml`, `clickhouse/users.xml`
- **Migrations**: `clickhouse/migrations/`

### PostgreSQL
- **Port**: 5432
- **Purpose**: IAM data storage
- **Config**: `postgresql/postgresql.conf`
- **Database**: telemetryflow_db

## Docker Integration

All configurations are mounted in `docker-compose.yml`:

```yaml
services:
  postgres:
    volumes:
      - ./config/postgresql/postgresql.conf:/etc/postgresql/postgresql.conf

  clickhouse:
    volumes:
      - ./config/clickhouse/config.xml:/etc/clickhouse-server/config.xml
      - ./config/clickhouse/users.xml:/etc/clickhouse-server/users.xml
```

## Quick Start

```bash
# Start all services with configurations
docker-compose up -d

# Initialize ClickHouse schema
docker exec -i telemetryflow_uptime_clickhouse clickhouse-client --multiquery < config/clickhouse/migrations/001-audit-logs.sql

# Verify configurations
docker-compose logs postgres
docker-compose logs clickhouse
```

## Configuration Updates

After modifying configurations:

```bash
# Restart specific service
docker-compose restart postgres
docker-compose restart clickhouse

# Or restart all
docker-compose restart
```

## Documentation

- [ClickHouse](./clickhouse/README.md)
- [PostgreSQL](./postgresql/README.md)
