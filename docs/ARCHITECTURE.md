# TelemetryFlow Uptime -- System Architecture

- **Version:** 1.4.0
- **API Prefix:** `/api/v2`
- **License:** Apache-v2.0 -- Telemetri Data Indonesia

**TelemetryFlow Uptime (TelemetryFlow-Uptime)** is a full-stack monorepo providing Uptime
Monitoring, Status Pages, Identity and Access Management (IAM), Alerting, and
Audit management. The backend follows Domain-Driven Design with CQRS, and the
frontend is a Vue 3 SPA served through Nginx.

---

## 1. High-Level Architecture

The system is a containerised full-stack application. A browser communicates
with an Nginx reverse-proxy that serves the Vue 3 SPA and forwards API requests
to the NestJS backend. The backend persists relational data in PostgreSQL,
time-series / analytics data in ClickHouse, uses Redis for caching and BullMQ
job queues, and publishes cross-module domain events over NATS JetStream.

```mermaid
flowchart TB
    subgraph Client
        User["User / Browser"]
    end

    subgraph Docker Network["Docker Network (172.145.0.0/16)"]
        Nginx["Nginx<br/>:8080<br/>Frontend SPA"]
        Backend["NestJS API<br/>:3000"]
        PG["PostgreSQL<br/>:5432"]
        CH["ClickHouse<br/>:8123 / :9000"]
        Redis["Redis<br/>:6379"]
        NATS["NATS JetStream<br/>:4222"]
    end

    User --> Nginx
    Nginx -- "Static assets" --> User
    Nginx -- "/api/v2/*" --> Backend
    Backend --> PG
    Backend --> CH
    Backend --> Redis
    Backend --> NATS
```

All services run on a dedicated Docker bridge network
(`telemetryflow_uptime_net`, subnet `172.145.0.0/16`) and are orchestrated via
`docker-compose` with profile-based activation (`uptime`, `tools`, `all`).

---

## 2. Monorepo Structure

The project uses **pnpm workspaces** with **Turborepo** for build
orchestration.

```
telemetryflow-uptime/
├── backend/                        # NestJS API (TypeScript)
│   ├── src/
│   │   ├── main.ts                 # Bootstrap, Swagger, Bull Board
│   │   ├── app.module.ts           # Root module -- registers all modules
│   │   ├── app.controller.ts       # Health / version endpoints
│   │   ├── database/               # Migration & seed runners
│   │   │   ├── postgres/           # PostgreSQL migrations + seeds
│   │   │   ├── clickhouse/         # ClickHouse migrations + seeds
│   │   │   └── typeorm.config.ts
│   │   ├── health/                 # Health-check module
│   │   ├── logger/                 # Winston-based structured logging
│   │   ├── modules/                # Domain modules (15 modules)
│   │   │   ├── alerting/
│   │   │   ├── api-keys/
│   │   │   ├── audit/
│   │   │   ├── auth/
│   │   │   ├── cache/
│   │   │   ├── data-masking/
│   │   │   ├── iam/
│   │   │   ├── llm/
│   │   │   ├── monitoring/
│   │   │   │   ├── uptime/         # Uptime Monitoring (HTTP/TCP/Ping)
│   │   │   │   └── status-page/    # Status Pages & Incidents
│   │   │   ├── notification/
│   │   │   ├── query/
│   │   │   ├── retention/
│   │   │   ├── sso/
│   │   │   └── tenancy/
│   │   └── shared/                 # Cross-cutting infrastructure
│   │       ├── cache/              # Redis cache module
│   │       ├── clickhouse/         # ClickHouse client module
│   │       ├── domain/             # DDD base classes
│   │       ├── dto/                # Shared DTOs
│   │       ├── errors/             # Domain / application errors
│   │       ├── filters/            # HTTP exception filters
│   │       ├── pipes/              # Custom validation pipes
│   │       ├── queue/              # BullMQ queue module
│   │       ├── security/           # Security utilities
│   │       ├── utils/
│   │       └── validation/
│   ├── nest-cli.json
│   ├── tsconfig.json
│   └── package.json
├── frontend/                       # Vue 3 SPA (Vite + UnoCSS)
│   ├── src/
│   │   ├── api/                    # API client layer
│   │   ├── components/             # Reusable UI components
│   │   ├── composables/            # Vue composition functions
│   │   ├── layouts/                # Page layouts
│   │   ├── plugins/                # Vue plugins
│   │   ├── router/                 # Vue Router configuration
│   │   ├── services/               # Frontend services
│   │   ├── store/                  # Pinia stores
│   │   │   ├── auth.ts
│   │   │   ├── uptime.ts
│   │   │   ├── alerts.ts
│   │   │   ├── llm.ts
│   │   │   ├── data-masking.ts
│   │   │   └── app.ts
│   │   ├── views/                  # Page-level views
│   │   │   ├── account/
│   │   │   ├── alerts/
│   │   │   ├── audit/
│   │   │   ├── auth/
│   │   │   ├── error/
│   │   │   ├── home/
│   │   │   ├── iam/
│   │   │   ├── monitoring/
│   │   │   ├── settings/
│   │   │   └── tenancy/
│   │   └── main.ts
│   ├── vite.config.ts
│   ├── uno.config.ts
│   └── package.json
├── config/                         # External configuration
│   ├── nginx/                      # Nginx config
│   │   ├── nginx.conf
│   │   └── conf.d/
│   │       └── default.conf
│   ├── postgresql/
│   └── clickhouse/
├── scripts/                        # Operational scripts
│   ├── bootstrap.sh
│   ├── db-cleanup.sh
│   ├── generate-secrets.js
│   ├── init-volumes.sh
│   └── test-build.sh
├── docker-compose.yml
├── Dockerfile.backend
├── Dockerfile.frontend
├── turbo.json                      # Turborepo pipeline config
├── pnpm-workspace.yaml
├── Makefile
└── package.json                    # Root workspace manifest
```

---

## 3. Backend Module Architecture

The backend is composed of 15 domain modules registered in `AppModule`. Each
module encapsulates its own presentation, application, domain, and
infrastructure layers. The diagram below shows module imports (dependencies).

```mermaid
flowchart BT
    subgraph Foundational["Foundational Layer"]
        AuditModule["AuditModule"]
        CacheModule["CacheModule<br/>(shared)"]
        QueueModule["QueueModule<br/>(shared)"]
        ClickHouseModule["ClickHouseModule<br/>(shared)"]
    end

    subgraph Core["Core Platform Layer"]
        AuthModule["AuthModule"]
        IAMModule["IAMModule"]
        TenancyModule["TenancyModule"]
        SsoModule["SsoModule"]
        ApiKeysModule["ApiKeysModule"]
    end

    subgraph Domain["Domain Feature Layer"]
        UptimeModule["UptimeModule"]
        StatusPageModule["StatusPageModule"]
        AlertingModule["AlertingModule"]
        QueryModule["QueryModule"]
        NotificationModule["NotificationModule<br/>(Global)"]
    end

    subgraph Platform["Platform Services Layer"]
        LLMModule["LLMModule"]
        DataMaskingModule["DataMaskingModule"]
        RetentionModule["RetentionModule"]
    end

    AuthModule --> AuditModule
    AuthModule --> CacheModule
    AuthModule --> SsoModule
    AuthModule --> IAMModule
    AuthModule --> ApiKeysModule

    IAMModule --> AuditModule

    DataMaskingModule --> CacheModule

    UptimeModule --> AlertingModule

    AlertingModule --> QueryModule

    QueryModule --> ClickHouseModule

    StatusPageModule -.-> NotificationModule
    AlertingModule -.-> NotificationModule
```

### Module Summary

| Module                 | Responsibility                                                             | Key Controllers                                                                      |
| ---------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **AuthModule**         | Authentication, JWT, MFA, sessions, password reset, OAuth/SSO login        | `AuthController`, `MfaController`, `PasswordResetController`                         |
| **IAMModule**          | Users, roles, permissions, groups, tenants, orgs, workspaces, regions      | `UserController`, `RoleController`, `PermissionController`, `TenantController`       |
| **TenancyModule**      | Region, Organization, Workspace, Tenant provisioning                       | `RegionsController`, `OrganizationsController`, `WorkspacesController`               |
| **UptimeModule**       | HTTP uptime monitors, check scheduling, result persistence                 | `MonitorController`                                                                  |
| **StatusPageModule**   | Public status pages, incidents, subscriber management                      | `StatusPageController`, `PublicStatusPageController`                                 |
| **AlertingModule**     | Alert rules, alert instances, notification channels, evaluation scheduling | `AlertRulesController`, `AlertInstancesController`, `NotificationChannelsController` |
| **QueryModule**        | ClickHouse query builder, TFQL validation, stats aggregation               | `SignalsQueryController`                                                             |
| **NotificationModule** | Email delivery (SMTP), notification logs, templates (Global module)        | --                                                                                   |
| **ApiKeysModule**      | API key CRUD, encryption, ingestion rate limiting                          | `ApiKeysController`                                                                  |
| **SsoModule**          | SSO/OAuth2 provider configuration                                          | `SsoController`                                                                      |
| **AuditModule**        | Audit log persistence and retrieval, audit interceptor                     | `AuditController`                                                                    |
| **DataMaskingModule**  | Data masking policy CRUD, runtime masking service                          | `DataMaskingController`                                                              |
| **LLMModule**          | Multi-provider AI chat, insights, conversation history                     | `LLMProvidersController`, `ChatController`, `InsightsController`                     |
| **RetentionModule**    | Retention policy CRUD, enforcement scheduling                              | `RetentionPolicyController`                                                          |
| **CacheModule**        | Redis-backed caching service                                               | --                                                                                   |

---

## 4. DDD Layer Architecture

Every domain module follows the same four-layer structure. Dependencies point
inward: outer layers depend on inner layers, never the reverse. The Domain
layer defines repository interfaces (ports); the Infrastructure layer provides
concrete implementations (adapters), satisfying the Dependency Inversion
Principle.

```mermaid
flowchart TB
    subgraph Presentation["Presentation Layer"]
        direction LR
        Controllers["Controllers"]
        DTOs["DTOs"]
    end

    subgraph Application["Application Layer"]
        direction LR
        Commands["Commands"]
        Queries["Queries"]
        CommandHandlers["Command Handlers"]
        QueryHandlers["Query Handlers"]
        AppServices["Application Services"]
    end

    subgraph Domain["Domain Layer"]
        direction LR
        Aggregates["Aggregates"]
        Entities["Entities"]
        ValueObjects["Value Objects"]
        DomainEvents["Domain Events"]
        RepoInterfaces["Repository Interfaces"]
        DomainServices["Domain Services"]
    end

    subgraph Infrastructure["Infrastructure Layer"]
        direction LR
        TypeORMRepo["TypeORM Repositories"]
        CHRepo["ClickHouse Repositories"]
        Schedulers["Schedulers"]
        Checkers["Checkers"]
        ExternalProviders["External Providers"]
    end

    Presentation --> Application
    Application --> Domain
    Infrastructure -.->|"implements"| RepoInterfaces
    Infrastructure --> Domain

    style Domain fill:#e8f4e8,stroke:#2d7a2d
    style Presentation fill:#e8e8f4,stroke:#2d2d7a
    style Application fill:#f4f4e8,stroke:#7a7a2d
    style Infrastructure fill:#f4e8e8,stroke:#7a2d2d
```

### Layer Directory Layout (per module)

```
module-name/
├── domain/
│   ├── aggregates/            # Aggregate roots (e.g., Monitor, Organization)
│   ├── entities/              # Domain entities
│   ├── value-objects/         # Value objects (e.g., OrganizationId, TenantId)
│   ├── events/                # Domain events
│   ├── repositories/          # Repository interface tokens
│   └── services/              # Domain services
├── application/
│   ├── commands/              # CQRS command definitions
│   ├── handlers/              # Command + query handlers
│   └── services/              # Application-level services
├── infrastructure/
│   ├── persistence/           # TypeORM entities + repositories
│   │   ├── entities/          # ORM entity classes
│   │   ├── migrations/        # Database migrations
│   │   ├── seeds/             # Seed data
│   │   └── *Repository.ts     # Repository implementations
│   ├── schedulers/            # Cron-based schedulers
│   ├── checkers/              # Health checkers (e.g., HttpChecker)
│   ├── services/              # Infrastructure services
│   ├── providers/             # External provider adapters
│   ├── guards/                # Custom guards
│   └── messaging/             # Event processors
├── presentation/
│   └── controllers/           # NestJS controllers
├── config/                    # Module-specific configuration
├── dto/                       # Request/response DTOs
├── guards/                    # Exported guards
├── strategies/                # Passport strategies
├── templates/                 # Email templates
└── module-name.module.ts      # NestJS module definition
```

### Shared DDD Base Classes

The `shared/domain/` directory provides reusable DDD primitives:

| Class              | File                             | Purpose                                 |
| ------------------ | -------------------------------- | --------------------------------------- |
| `AggregateRoot<T>` | `shared/domain/AggregateRoot.ts` | Base class with domain event collection |
| `Entity`           | `shared/domain/Entity.ts`        | Base entity with identity               |
| `ValueObject`      | `shared/domain/ValueObject.ts`   | Immutable value object base             |
| `DomainEvent`      | `shared/domain/DomainEvent.ts`   | Domain event base class                 |

---

## 5. CQRS Flow

The application uses the **CQRS** (Command Query Responsibility Segregation)
pattern via `@nestjs/cqrs`. Write operations are dispatched as Commands
through the `CommandBus`; read operations are dispatched as Queries through the
`QueryBus`. Each has a dedicated handler.

```mermaid
sequenceDiagram
    participant Client
    participant Controller
    participant CommandBus
    participant CommandHandler
    participant Repository
    participant Database

    Client->>Controller: POST /api/v2/monitors
    Controller->>CommandBus: execute(new CreateMonitorCommand(...))
    CommandBus->>CommandHandler: handle(command)
    CommandHandler->>Repository: save(aggregate)
    Repository->>Database: INSERT (PostgreSQL / ClickHouse)
    Database-->>Repository: OK
    Repository-->>CommandHandler: aggregate
    CommandHandler-->>CommandBus: result
    CommandBus-->>Controller: result
    Controller-->>Client: 201 Created

    Note over Client,Database: Read Path

    participant QueryBus
    participant QueryHandler
    participant ReadModel

    Client->>Controller: GET /api/v2/monitors
    Controller->>QueryBus: execute(new ListMonitorsQuery(...))
    QueryBus->>QueryHandler: handle(query)
    QueryHandler->>ReadModel: find(query)
    ReadModel-->>QueryHandler: data
    QueryHandler-->>QueryBus: result
    QueryBus-->>Controller: result
    Controller-->>Client: 200 OK
```

### Example: UptimeModule Commands

| Command                | Handler                | Description                  |
| ---------------------- | ---------------------- | ---------------------------- |
| `CreateMonitorCommand` | `CreateMonitorHandler` | Create a new uptime monitor  |
| `UpdateMonitorCommand` | `UpdateMonitorHandler` | Update monitor configuration |
| `DeleteMonitorCommand` | `DeleteMonitorHandler` | Remove a monitor             |
| `PauseMonitorCommand`  | `PauseMonitorHandler`  | Pause check scheduling       |
| `ResumeMonitorCommand` | `ResumeMonitorHandler` | Resume check scheduling      |

---

## 6. Uptime Check Flow

The `UptimeModule` uses `@nestjs/schedule` to run periodic health checks. The
`UptimeCheckerScheduler` triggers `HttpChecker` for each active monitor. Results
are written to both PostgreSQL (entity state) and ClickHouse (time-series
analytics). If a status change is detected, the `AlertingModule` is notified.

```mermaid
sequenceDiagram
    participant Scheduler as UptimeCheckerScheduler
    participant HttpChecker as HttpChecker
    participant Monitor as Monitor (Aggregate)
    participant PGRepo as UptimeCheckRepository<br/>(PostgreSQL)
    participant CHRepo as UptimeCheckClickHouseRepository<br/>(ClickHouse)
    participant Alerting as AlertingModule

    Scheduler->>Scheduler: Cron tick (interval per monitor)
    Scheduler->>HttpChecker: check(url, options)
    HttpChecker->>HttpChecker: HTTP request + latency measurement
    HttpChecker-->>Scheduler: CheckResult{status, latency, statusCode}

    Scheduler->>Monitor: recordCheckResult(CheckResult)
    Monitor->>Monitor: Detect status change (up/down/degraded)

    Scheduler->>PGRepo: save(UptimeCheck)
    PGRepo->>PGRepo: INSERT into PostgreSQL

    Scheduler->>CHRepo: save(UptimeCheck)
    CHRepo->>CHRepo: INSERT into ClickHouse

    alt Status changed
        Monitor->>Alerting: Evaluate alert rules
        Alerting->>Alerting: Check alert conditions (TFQL)
        Alerting->>Alerting: Create AlertInstance if triggered
        Alerting->>Alerting: Send notification via NotificationModule
    end
```

### Key Infrastructure Components

| Component                         | File                                                                             | Purpose                                          |
| --------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------ |
| `UptimeCheckerScheduler`          | `monitoring/uptime/infrastructure/schedulers/UptimeChecker.scheduler.ts`          | Cron-based scheduler for all active monitors     |
| `HttpChecker`                     | `monitoring/uptime/infrastructure/checkers/HttpChecker.ts`                        | Performs HTTP health check requests              |
| `UptimeCheckRepository`           | `monitoring/uptime/infrastructure/persistence/UptimeCheckRepository.ts`           | PostgreSQL persistence for check results         |
| `UptimeCheckClickHouseRepository` | `monitoring/uptime/infrastructure/persistence/UptimeCheckClickHouseRepository.ts` | ClickHouse persistence for time-series analytics |
| `MonitorRepository`               | `monitoring/uptime/infrastructure/persistence/MonitorRepository.ts`               | PostgreSQL persistence for monitor configuration |
| `MonitorGroupRepository`          | `monitoring/uptime/infrastructure/persistence/MonitorGroupRepository.ts`          | PostgreSQL persistence for monitor groups        |

### Domain Aggregates

| Aggregate      | Description                                                                          |
| -------------- | ------------------------------------------------------------------------------------ |
| `Monitor`      | Root aggregate representing a single uptime monitor with its configuration and state |
| `MonitorGroup` | Groups monitors for organisational purposes                                          |
| `UptimeCheck`  | Represents a single check result with timing, status, and response details           |

---

## 7. Status Page Public Flow

The `StatusPageModule` exposes an unauthenticated public endpoint at
`/public/status/:slug` that renders the current status page along with active
incidents and associated monitors.

```mermaid
sequenceDiagram
    participant Browser
    participant API as PublicStatusPageController
    participant SPRepo as StatusPageRepository
    participant IncRepo as IncidentRepository
    participant SubRepo as SubscriberRepository

    Browser->>API: GET /public/status/:slug
    API->>SPRepo: findBySlug(slug)
    SPRepo-->>API: StatusPage entity

    alt Page not found
        API-->>Browser: 404 Not Found
    end

    API->>IncRepo: findActiveByStatusPageId(pageId)
    IncRepo-->>API: Incident[]

    API->>SPRepo: findMonitorsByStatusPageId(pageId)
    SPRepo-->>API: Monitor[]

    API-->>Browser: 200 OK
    Note right of API: Response body:<br/>{ statusPage, incidents, monitors }
```

### Status Page Entities

| Entity       | Description                                                     |
| ------------ | --------------------------------------------------------------- |
| `StatusPage` | Page configuration: slug, title, description, theme, custom CSS |
| `Incident`   | Active or resolved incidents linked to a status page            |
| `Subscriber` | Users subscribed to status page updates                         |

---

## 8. Multi-Tenancy Architecture

The tenancy model follows a four-level hierarchy. Every data entity in the
system is scoped by `organizationId` at the database level, ensuring complete
tenant isolation.

```mermaid
flowchart TB
    subgraph Tenancy Hierarchy
        Region["Region<br/><i>e.g. asia-southeast1</i>"]
        Tenant["Tenant<br/><i>Top-level billing entity</i>"]
        Organization["Organization<br/><i>Data isolation boundary</i>"]
        Workspace["Workspace<br/><i>Feature-level grouping</i>"]
    end

    Region --> Tenant
    Tenant --> Organization
    Organization --> Workspace

    subgraph Scoped Resources
        Monitors["Uptime Monitors"]
        StatusPages["Status Pages"]
        AlertRules["Alert Rules"]
        Users["Users / Roles / Permissions"]
        APIKeys["API Keys"]
    end

    Workspace --> Monitors
    Workspace --> StatusPages
    Organization --> AlertRules
    Organization --> Users
    Organization --> APIKeys
```

### Tenancy Domain Model

| Aggregate      | Value Object     | Description                                   |
| -------------- | ---------------- | --------------------------------------------- |
| `Region`       | `RegionId`       | Geographic or infrastructure region           |
| `Tenant`       | `TenantId`       | Top-level billing entity within a region      |
| `Organization` | `OrganizationId` | Data isolation boundary; scopes all entities  |
| `Workspace`    | `WorkspaceId`    | Feature-level grouping within an organization |

All repository queries include `organizationId` filtering to enforce tenant
isolation at the application layer. The IAM module manages role assignments and
permissions within each organizational scope.

---

## 9. Data Flow Diagram

This diagram illustrates how data flows through the system, from the user
request to the various storage backends, and how cross-module events propagate.

```mermaid
flowchart LR
    subgraph Client
        FE["Vue 3 SPA<br/>(Browser)"]
    end

    subgraph Proxy
        Nginx["Nginx<br/>:8080"]
    end

    subgraph API["NestJS Backend :3000"]
        Controllers["Controllers"]
        Handlers["CQRS Handlers"]
        Schedulers["Schedulers"]
    end

    subgraph Storage["Data Stores"]
        PG["PostgreSQL<br/>Entities, Relations,<br/>Configuration"]
        CH["ClickHouse<br/>Time-Series Metrics,<br/>Audit Logs"]
        RD["Redis<br/>Cache (DB 0)<br/>BullMQ Queues (DB 1)"]
    end

    subgraph Messaging
        NATS["NATS JetStream<br/>Domain Events"]
    end

    subgraph External
        SMTP["SMTP Server<br/>Email Delivery"]
        LLM["LLM Providers<br/>Claude, OpenAI, etc."]
    end

    FE --> Nginx
    Nginx --> Controllers
    Controllers --> Handlers
    Handlers --> PG
    Handlers --> CH
    Handlers --> RD
    Schedulers --> PG
    Schedulers --> CH
    Handlers --> NATS
    NATS --> Handlers
    Handlers --> SMTP
    Handlers --> LLM

    style Storage fill:#f9f,stroke:#333
    style Messaging fill:#ff9,stroke:#333
    style External fill:#9ff,stroke:#333
```

### Storage Responsibility Matrix

| Store              | Responsibility                                                     | Examples                                                    |
| ------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------- |
| **PostgreSQL**     | Primary relational store for all entities, configuration, IAM data | Users, Roles, Monitors, Alert Rules, Status Pages, API Keys |
| **ClickHouse**     | Time-series and analytics storage                                  | Uptime check results, audit logs, aggregated metrics        |
| **Redis DB 0**     | Application cache                                                  | Session data, frequently queried entities, rate limiting    |
| **Redis DB 1**     | BullMQ job queues                                                  | Background job processing, scheduled tasks                  |
| **NATS JetStream** | Durable domain event messaging                                     | Cross-module event propagation (e.g., IAM events)           |

---

## 10. Authentication and Authorization Flow

Authentication uses JWT tokens issued by the `AuthModule`. Every request to a
protected endpoint passes through `JwtAuthGuard` followed by `PermissionsGuard`.
API key-based authentication is also supported via `ApiKeyGuard`.

```mermaid
sequenceDiagram
    participant Client
    participant AuthGuard as JwtAuthGuard
    participant PermGuard as PermissionsGuard
    participant Controller
    participant AuthService

    Note over Client,AuthService: Login Phase

    Client->>AuthService: POST /api/v2/auth/login {email, password}
    AuthService->>AuthService: Validate credentials
    AuthService->>AuthService: Check MFA if enabled
    AuthService-->>Client: 200 { accessToken, refreshToken }

    Note over Client,AuthService: Authenticated Request Phase

    Client->>AuthGuard: GET /api/v2/monitors<br/>Authorization: Bearer {token}
    AuthGuard->>AuthGuard: Verify JWT signature + expiry
    AuthGuard->>AuthGuard: Attach user to request
    AuthGuard->>PermGuard: Forward authenticated request
    PermGuard->>PermGuard: Check required permissions<br/>against user roles
    PermGuard->>Controller: Forward authorized request
    Controller-->>Client: 200 OK

    Note over Client,AuthService: API Key Authentication (alternative)

    Client->>AuthGuard: GET /api/v2/monitors<br/>X-API-Key: {key}
    AuthGuard->>AuthGuard: Detect API key header
    AuthGuard->>AuthService: Validate API key + rate limit
    AuthService-->>AuthGuard: Authenticated identity
    AuthGuard->>PermGuard: Forward
    PermGuard->>Controller: Forward
    Controller-->>Client: 200 OK
```

### Auth Guards

| Guard                 | Purpose                                                 |
| --------------------- | ------------------------------------------------------- |
| `JwtAuthGuard`        | Validates JWT Bearer tokens or API keys                 |
| `PermissionsGuard`    | Checks user permissions against required @Permissions() |
| `RateLimitGuard`      | Enforces per-user rate limiting                         |
| `SuperAdminGuard`     | Restricts access to super-admin endpoints               |
| `ApiKeyGuard`         | Dedicated API key validation for ingestion endpoints    |
| `IngestionAuthGuard`  | Auth for data ingestion endpoints with rate limiting    |
| `LLMRateLimiterGuard` | Rate limiting specific to LLM/AI endpoints              |

### Supported Authentication Methods

- Email + Password login
- Multi-Factor Authentication (TOTP-based MFA)
- OAuth2 / SSO (configurable providers)
- API Key authentication (with encryption at rest)
- Password reset flow with email verification
- Session management with device tracking

---

## 11. Docker Network Architecture

All services communicate over the `telemetryflow_uptime_net` bridge network
with static IP assignments in the `172.145.0.0/16` subnet.

```mermaid
flowchart TB
    subgraph Docker["Docker Network: telemetryflow_uptime_net"]
        subgraph Subnet["172.145.0.0/16"]
            FE["frontend<br/>172.145.145.80<br/>:8080 (host) -> :80 (container)"]
            BE["backend<br/>172.145.145.10<br/>:3000"]
            PG["postgres<br/>172.145.145.20<br/>:5432"]
            RD["redis<br/>172.145.145.30<br/>:6379"]
            NT["nats<br/>172.145.145.55<br/>:4222 (client)<br/>:8222 (monitor)"]
            CH["clickhouse<br/>172.151.151.40<br/>:8123 (HTTP)<br/>:9000 (native)"]
        end
    end

    FE --> BE
    BE --> PG
    BE --> RD
    BE --> NT
    BE --> CH
```

### Container Details

| Service        | Image                               | Host Port  | Container Port | Static IP      | Health Check     |
| -------------- | ----------------------------------- | ---------- | -------------- | -------------- | ---------------- |
| **frontend**   | Custom (Nginx)                      | 8080       | 80             | 172.145.145.80 | --               |
| **backend**    | Custom (Node.js)                    | 3000       | 3000           | 172.145.145.10 | --               |
| **postgres**   | postgres:16-alpine                  | 5432       | 5432           | 172.145.145.20 | `pg_isready`     |
| **redis**      | redis:7-alpine                      | 6379       | 6379           | 172.145.145.30 | `redis-cli ping` |
| **nats**       | nats:2-alpine                       | 4222, 8222 | 4222, 8222     | 172.145.145.55 | HTTP `/healthz`  |
| **clickhouse** | clickhouse/clickhouse-server:latest | 8123, 9000 | 8123, 9000     | 172.151.151.40 | HTTP `/ping`     |

### Docker Compose Profiles

| Profile  | Services                                             |
| -------- | ---------------------------------------------------- |
| `uptime` | postgres, clickhouse, redis, nats, backend, frontend |
| `tools`  | portainer                                            |
| `all`    | All of the above                                     |

---

## 12. Technology Stack

### Backend

| Category          | Technology                          | Version |
| ----------------- | ----------------------------------- | ------- |
| Runtime           | Node.js                             | 23.x    |
| Framework         | NestJS                              | 11.x    |
| Language          | TypeScript                          | 5.9     |
| ORM               | TypeORM                             | --      |
| CQRS              | @nestjs/cqrs                        | --      |
| Scheduling        | @nestjs/schedule                    | --      |
| Authentication    | Passport.js, @nestjs/jwt            | --      |
| Validation        | class-validator, class-transformer  | --      |
| API Documentation | Swagger / OpenAPI (@nestjs/swagger) | 2.0     |
| Logging           | Winston                             | --      |
| Tracing           | OpenTelemetry SDK                   | --      |
| Queue             | BullMQ                              | --      |
| Testing           | Jest                                | --      |

### Frontend

| Category         | Technology              |
| ---------------- | ----------------------- |
| Framework        | Vue 3 (Composition API) |
| Build Tool       | Vite                    |
| State Management | Pinia                   |
| Routing          | Vue Router              |
| CSS Engine       | UnoCSS                  |
| HTTP Client      | Axios / Fetch           |
| Testing          | Vitest                  |

### Data Stores

| Store      | Purpose                             | Version     |
| ---------- | ----------------------------------- | ----------- |
| PostgreSQL | Primary relational database         | 16 (Alpine) |
| ClickHouse | Time-series analytics, audit logs   | Latest      |
| Redis      | Cache, session store, BullMQ queues | 7 (Alpine)  |

### Messaging

| Technology     | Purpose                        | Version    |
| -------------- | ------------------------------ | ---------- |
| NATS JetStream | Durable domain event messaging | 2 (Alpine) |

### Infrastructure

| Category          | Technology                  |
| ----------------- | --------------------------- |
| Container Runtime | Docker                      |
| Orchestration     | Docker Compose (profiles)   |
| Reverse Proxy     | Nginx                       |
| Build System      | Turborepo + pnpm workspaces |
| Package Manager   | pnpm 10.24                  |
| CI/CD             | Makefile-based pipeline     |

### External Integrations

| Integration       | Purpose                                                               |
| ----------------- | --------------------------------------------------------------------- |
| SMTP (Nodemailer) | Email delivery for notifications, verification, alerts                |
| LLM Providers     | AI chat and insights (Claude, OpenAI, Gemini, DeepSeek, Qwen, Ollama) |
| OAuth2 Providers  | SSO authentication                                                    |

---

## Appendix: Request Lifecycle

Every HTTP request passes through the following NestJS middleware and
interceptor pipeline before reaching a controller:

```mermaid
flowchart TB
    A["Incoming Request"] --> B["RequestContextMiddleware<br/><i>Attaches correlation ID, request metadata</i>"]
    B --> C["ValidationPipe (global)<br/><i>Transforms + validates DTOs</i>"]
    C --> D["JwtAuthGuard<br/><i>Validates JWT or API key</i>"]
    D --> E["PermissionsGuard<br/><i>Checks role-based permissions</i>"]
    E --> F["Controller<br/><i>Handles request, dispatches CQRS</i>"]
    F --> G["AuditInterceptor (global)<br/><i>Logs action to audit trail</i>"]
    G --> H["HttpLoggingInterceptor (global)<br/><i>Structured request/response logging</i>"]
    H --> I["HttpExceptionFilter (global)<br/><i>Normalises error responses</i>"]
    I --> J["Outgoing Response"]
```
