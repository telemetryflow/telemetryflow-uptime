# Uptime Alerting & Notification

> **Version:** 1.4.0 | **Module Path:** `backend/src/modules/monitoring/uptime/` + `backend/src/modules/alerting/`

TelemetryFlow Uptime provides a two-layer alerting system that detects monitor status changes in real-time and dispatches notifications through 9 configurable channels.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Alert Flow: Two Paths](#2-alert-flow-two-paths)
3. [Monitor Status Transitions](#3-monitor-status-transitions)
4. [Notification Channels](#4-notification-channels)
5. [Per-Monitor Notification Config](#5-per-monitor-notification-config)
6. [Alert Rules for Uptime](#6-alert-rules-for-uptime)
7. [API Endpoints](#7-api-endpoints)
8. [Frontend Components](#8-frontend-components)
9. [File Structure](#9-file-structure)

---

## 1. Architecture Overview

```mermaid
graph TB
    subgraph Uptime Module
        SCHED[UptimeCheckerScheduler<br/>every 10s]
        CHK[HttpChecker]
        MON[Monitor Aggregate<br/>recordCheckResult]
    end

    subgraph Alerting Module
        AEVAL[AlertEvaluationScheduler<br/>every 1 min]
        RULE[AlertRule<br/>evaluate conditions]
        ASVC[NotificationChannelService]
    end

    subgraph Notification Module
        SENDER[NotificationSender<br/>9 channel types]
        EMAIL[EmailService<br/>Handlebars templates]
    end

    SCHED --> CHK --> MON
    MON -->|status changed| SCHED
    SCHED -->|Path A: Direct| ASVC
    AEVAL -->|Path B: Rule-based| RULE
    RULE -->|trigger/resolve| ASVC
    ASVC --> SENDER
    SENDER --> EMAIL
    SENDER -->|Slack/Discord/Teams<br/>Zoom/Telegram<br/>PagerDuty/OpsGenie<br/>Webhook| EXT[External Services]
```

**Key dependency:** The Uptime module imports `AlertingModule`, which provides `NotificationChannelService`. The Notification module provides `EmailService` with Handlebars templates.

---

## 2. Alert Flow: Two Paths

### Path A: Direct Uptime Notification (Real-Time)

Fires immediately when a monitor status changes during a check cycle.

```mermaid
sequenceDiagram
    participant S as Scheduler (10s)
    participant C as HttpChecker
    participant M as Monitor
    participant DB as PostgreSQL
    participant CH as ClickHouse
    participant N as NotificationChannelService

    S->>C: checkMonitor(monitor)
    C-->>S: CheckResult {status, responseTime, sslInfo}
    S->>M: recordCheckResult(isUp, responseTime)
    M-->>S: previousStatus → newStatus
    S->>DB: save(monitor) + save(check)
    S->>CH: insertCheck(check)

    alt Status changed: UP→DOWN
        S->>N: sendAlertNotification({type: "down"})
        N-->>S: dispatched to channels
    else Status changed: DOWN→UP
        S->>N: sendAlertNotification({type: "recovery"})
        N-->>S: dispatched to channels
    else Still DOWN + resendInterval elapsed
        S->>N: sendAlertNotification({type: "reminder"})
        N-->>S: dispatched to channels
    end
```

**Source:** `monitoring/uptime/infrastructure/schedulers/UptimeChecker.scheduler.ts:200-308`

### Path B: Alert Rule Evaluation (Periodic)

Evaluates AlertRules periodically for conditions like SSL certificate expiry.

```mermaid
sequenceDiagram
    participant CRON as Cron (1min)
    participant EVAL as AlertEvaluation
    participant CH as ClickHouse
    participant RULE as AlertRule
    participant N as NotificationChannelService

    CRON->>EVAL: evaluateOrganizationRules()
    EVAL->>CH: executeUptimeConditionQuery()
    Note over CH: e.g. ssl_days_remaining < 30
    CH-->>EVAL: metric values
    EVAL->>RULE: evaluate(values)

    alt Should trigger
        RULE-->>EVAL: shouldTrigger = true
        EVAL->>N: sendNotifications()
    else Should resolve
        RULE-->>EVAL: resolved
        EVAL->>N: sendResolveNotification()
    end
```

**Source:** `alerting/infrastructure/schedulers/AlertEvaluation.scheduler.ts`

---

## 3. Monitor Status Transitions

```mermaid
stateDiagram-v2
    [*] --> UP: Monitor Created
    UP --> DOWN: Check failed
    UP --> DEGRADED: responseTime > 80% timeout
    DOWN --> UP: Check succeeded
    DOWN --> DOWN: Still failing (resendInterval)
    DEGRADED --> UP: Response time normal
    DEGRADED --> DOWN: Check failed
```

| Transition    | Notification Type | Condition                                     |
| ------------- | ----------------- | --------------------------------------------- |
| UP → DOWN     | `firing`          | `consecutiveDownCount >= alertAfterDownCount` |
| DOWN → UP     | `recovery`        | `notifyOnRecovery === true`                   |
| DOWN → DOWN   | `reminder`        | `resendInterval` elapsed + still DOWN         |
| UP → DEGRADED | `firing`          | Same as DOWN transition                       |

**Notification trigger logic** (`Monitor.shouldNotify()`):

```typescript
shouldNotify(): boolean {
  return this.consecutiveDownCount >= (this.notificationConfig.alertAfterDownCount ?? 1);
}
```

---

## 4. Notification Channels

| Channel             | Protocol            | Format                      | Config Component      |
| ------------------- | ------------------- | --------------------------- | --------------------- |
| **Email**           | SMTP                | HTML (Handlebars templates) | `EmailConfig.vue`     |
| **Slack**           | HTTPS POST          | Block Kit messages          | `SlackConfig.vue`     |
| **Discord**         | HTTPS POST          | Rich embeds                 | `DiscordConfig.vue`   |
| **Microsoft Teams** | HTTPS POST          | Adaptive Cards v1.5         | `MSTeamsConfig.vue`   |
| **Zoom**            | HTTPS POST          | Incoming Webhook            | `ZoomConfig.vue`      |
| **Telegram**        | HTTPS POST          | Bot API sendMessage         | `TelegramConfig.vue`  |
| **PagerDuty**       | HTTPS POST          | Events API v2               | `PagerDutyConfig.vue` |
| **OpsGenie**        | HTTPS POST          | Alerts API v2               | `OpsGenieConfig.vue`  |
| **Webhook**         | HTTP POST/PUT/PATCH | JSON + HMAC-SHA256 signing  | `WebhookConfig.vue`   |

Each channel supports:
- Enable/disable toggle
- Test notification button (`POST /notification-channels/:id/test`)
- Custom auth headers (Webhook: Bearer/Basic/APIKey)

### Channel Dispatch Flow

```mermaid
flowchart LR
    subgraph NotificationChannelService
        SEND[sendAlertNotification]
    end

    subgraph NotificationSender
        ROUTE{Route by<br/>channel type}
    end

    SEND --> ROUTE

    ROUTE -->|email| SMTP[SMTP Server<br/>HTML via Handlebars]
    ROUTE -->|slack| SLACK[Slack Webhook<br/>Block Kit]
    ROUTE -->|discord| DISC[Discord Webhook<br/>Rich Embeds]
    ROUTE -->|msteams| TEAMS[Teams Webhook<br/>Adaptive Cards]
    ROUTE -->|zoom| ZOOM[Zoom Webhook<br/>Fields Format]
    ROUTE -->|telegram| TELE[Telegram Bot API<br/>HTML/Markdown]
    ROUTE -->|pagerduty| PD[PagerDuty Events API v2<br/>Severity Mapping]
    ROUTE -->|opsgenie| OG[OpsGenie Alerts API v2<br/>Priority P1-P5]
    ROUTE -->|webhook| WH[Generic HTTP<br/>HMAC-SHA256 Signed]
```

---

## 5. Per-Monitor Notification Config

Each monitor has a `notificationConfig` that controls alerting behavior:

```typescript
interface NotificationConfig {
  channels: string[]; // Notification channel IDs
  alertAfterDownCount?: number; // Fire after N consecutive failures (default: 1)
  resendInterval?: number; // Minutes between re-notifications while DOWN
  notifyOnRecovery?: boolean; // Send notification when recovered (default: true)
}
```

**Setting via API:**

```bash
POST /api/v2/uptime/monitors
{
  "name": "My Website",
  "url": "https://example.com",
  "type": "https",
  "interval": 60,
  "notification_channels": ["channel-uuid-1", "channel-uuid-2"],
  "alert_after_down_count": 3,
  "resend_interval": 15,
  "notify_on_recovery": true
}
```

---

## 6. Alert Rules for Uptime

Alert rules extend uptime monitoring with condition-based alerts:

### Supported Uptime Conditions

| Metric               | Operator                   | Example                   |
| -------------------- | -------------------------- | ------------------------- |
| `ssl_days_remaining` | `<`, `<=`, `>`, `>=`, `==` | `ssl_days_remaining < 30` |

### Creating an SSL Expiry Alert Rule

```bash
POST /api/v2/alert-rules
{
  "name": "SSL Certificate Expiring Soon",
  "enabled": true,
  "severity": "warning",
  "queryTarget": "uptime",
  "conditions": [
    {
      "metric": "ssl_days_remaining",
      "operator": "lt",
      "threshold": 30
    }
  ],
  "forDuration": 300,
  "notificationChannelIds": ["channel-uuid-1"]
}
```

### Alert Instance Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Pending: Condition met
    Pending --> FIRING: forDuration elapsed
    FIRING --> ACKNOWLEDGED: User acknowledges
    FIRING --> RESOLVED: Condition no longer met
    ACKNOWLEDGED --> RESOLVED: Condition no longer met
    RESOLVED --> [*]
```

---

## 7. API Endpoints

### Notification Channels

| Method   | Endpoint                                    | Description             |
| -------- | ------------------------------------------- | ----------------------- |
| `POST`   | `/api/v2/notification-channels`             | Create channel          |
| `GET`    | `/api/v2/notification-channels`             | List channels           |
| `GET`    | `/api/v2/notification-channels/defaults`    | Get default channel IDs |
| `PUT`    | `/api/v2/notification-channels/defaults`    | Set default channel IDs |
| `GET`    | `/api/v2/notification-channels/:id`         | Get channel details     |
| `PATCH`  | `/api/v2/notification-channels/:id`         | Update channel          |
| `POST`   | `/api/v2/notification-channels/:id/enable`  | Enable channel          |
| `POST`   | `/api/v2/notification-channels/:id/disable` | Disable channel         |
| `POST`   | `/api/v2/notification-channels/:id/test`    | Send test notification  |
| `DELETE` | `/api/v2/notification-channels/:id`         | Delete channel          |

### Alert Rules

| Method   | Endpoint                          | Description       |
| -------- | --------------------------------- | ----------------- |
| `POST`   | `/api/v2/alert-rules`             | Create alert rule |
| `GET`    | `/api/v2/alert-rules`             | List rules        |
| `GET`    | `/api/v2/alert-rules/:id`         | Get rule details  |
| `PATCH`  | `/api/v2/alert-rules/:id`         | Update rule       |
| `POST`   | `/api/v2/alert-rules/:id/enable`  | Enable rule       |
| `POST`   | `/api/v2/alert-rules/:id/disable` | Disable rule      |
| `DELETE` | `/api/v2/alert-rules/:id`         | Delete rule       |

### Alert Instances

| Method | Endpoint                                  | Description             |
| ------ | ----------------------------------------- | ----------------------- |
| `GET`  | `/api/v2/alert-instances`                 | List instances          |
| `GET`  | `/api/v2/alert-instances/stats`           | Alert statistics        |
| `GET`  | `/api/v2/alert-instances/:id`             | Get instance details    |
| `POST` | `/api/v2/alert-instances/:id/acknowledge` | Acknowledge alert       |
| `POST` | `/api/v2/alert-instances/:id/resolve`     | Manually resolve        |
| `POST` | `/api/v2/alert-instances/:id/silence`     | Silence until timestamp |

All endpoints require JWT auth with permissions: `alert:read`, `alert:write`, `alert:delete`.

---

## 8. Frontend Components

### Settings → Notification Channels

```
frontend/src/views/settings/
├── notification-channels/
│   ├── index.vue                    # Channel list page
│   ├── ChannelModal.vue             # Create/edit channel modal
│   └── components/
│       ├── EmailConfig.vue          # SMTP configuration form
│       ├── SlackConfig.vue          # Slack webhook form
│       ├── DiscordConfig.vue        # Discord webhook form
│       ├── MSTeamsConfig.vue        # Teams webhook form
│       ├── ZoomConfig.vue           # Zoom webhook form
│       ├── TelegramConfig.vue       # Telegram bot token form
│       ├── PagerDutyConfig.vue      # PagerDuty integration key form
│       ├── OpsGenieConfig.vue       # OpsGenie API key form
│       └── WebhookConfig.vue        # Generic HTTP webhook form
└── components/
    └── NotificationChannels.vue     # Embedded channel widget
```

### Alerts Management

```
frontend/src/views/alerts/
├── index.vue                        # Alert instances (firing/resolved/acknowledged)
├── rules.vue                        # Alert rules management
└── components/
    └── AlertRuleFormModal.vue       # Create/edit alert rule modal
```

### API Clients

| File                                        | Purpose                            |
| ------------------------------------------- | ---------------------------------- |
| `frontend/src/api/alerting.ts`              | Alert rules + instances API client |
| `frontend/src/api/notification-channels.ts` | Channel CRUD + test API client     |

---

## 9. File Structure

```
backend/src/modules/
├── monitoring/uptime/
│   ├── domain/aggregates/
│   │   ├── Monitor.ts               # NotificationConfig, shouldNotify()
│   │   └── UptimeCheck.ts           # CheckStatus enum
│   ├── infrastructure/
│   │   ├── schedulers/
│   │   │   └── UptimeChecker.scheduler.ts   # dispatchUptimeNotification()
│   │   └── checkers/
│   │       └── HttpChecker.ts       # HTTP/TCP/PING checks
│   └── presentation/controllers/
│       └── Monitor.controller.ts    # notification_channels in DTOs
│
├── alerting/
│   ├── domain/aggregates/
│   │   ├── AlertRule.ts             # Conditions, evaluate(), trigger()
│   │   └── AlertInstance.ts         # Lifecycle (FIRING→ACKNOWLEDGED→RESOLVED)
│   ├── application/services/
│   │   └── NotificationChannel.service.ts   # sendAlertNotification(), testChannel()
│   ├── infrastructure/
│   │   ├── schedulers/
│   │   │   └── AlertEvaluation.scheduler.ts # Cron rule evaluation
│   │   └── services/
│   │       ├── INotificationSender.ts       # Interface + AlertNotification type
│   │       └── NotificationSender.ts        # Dispatches to all 9 channels
│   └── presentation/controllers/
│       ├── AlertRules.controller.ts
│       ├── AlertInstances.controller.ts
│       └── NotificationChannels.controller.ts
│
└── notification/
    ├── domain/services/
    │   └── EmailService.ts           # Template rendering, sendUptimeDownEmail(), sendUptimeUpEmail()
    └── infrastructure/
        ├── providers/
        │   └── SMTPEmailProvider.ts  # SMTP transport
        └── templates/
            ├── uptime-down.hbs       # Monitor down email
            ├── uptime-up.hbs         # Monitor recovery email
            └── uptime-report.hbs     # Organization status report email
```
