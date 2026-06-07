# TFO-Uptime API Reference

Version 1.4.0 | Base URL: `/api/v2`

---

## Authentication

All authenticated endpoints require the `Authorization` header:

```
Authorization: Bearer <JWT_ACCESS_TOKEN>
```

Access tokens expire after 24 hours. Refresh tokens expire after 30 days.

Public endpoints that do not require authentication are noted in the tables below.

---

## Response Format

All API responses use a standard envelope format.

**Success:**

```json
{
  "status": "success",
  "data": {}
}
```

**Error:**

```json
{
  "status": "error",
  "message": "Description of the error"
}
```

**Paginated lists** wrap items in an object:

```json
{
  "status": "success",
  "data": {
    "items": [],
    "total": 100,
    "page": 1,
    "limit": 20
  }
}
```

---

## Uptime Monitoring

Base path: `/api/v2/uptime/monitors`

| Method | Path                | Permission                | Description                               | Request Body                           | Response                                  |
| ------ | ------------------- | ------------------------- | ----------------------------------------- | -------------------------------------- | ----------------------------------------- |
| POST   | `/`                 | `monitoring:uptime:write` | Create a new monitor                      | `CreateMonitorDto`                     | `MonitorResponseDto` (201)                |
| GET    | `/`                 | `monitoring:uptime:read`  | List monitors (paginated)                 | --                                     | `{ items, total, page, limit }`           |
| GET    | `/ssl-summary`      | `monitoring:uptime:read`  | Organization-wide SSL certificate summary | --                                     | `{ total, nearExpiry, minDays, maxDays }` |
| GET    | `/:id`              | `monitoring:uptime:read`  | Get monitor by ID                         | --                                     | `MonitorResponseDto`                      |
| PUT    | `/:id`              | `monitoring:uptime:write` | Update monitor                            | `UpdateMonitorDto`                     | `MonitorResponseDto`                      |
| DELETE | `/:id`              | `monitoring:uptime:write` | Delete monitor                            | --                                     | 204 No Content                            |
| POST   | `/:id/pause`        | `monitoring:uptime:write` | Pause monitor                             | --                                     | `MonitorResponseDto`                      |
| POST   | `/:id/resume`       | `monitoring:uptime:write` | Resume monitor                            | --                                     | `MonitorResponseDto`                      |
| GET    | `/:id/checks`       | `monitoring:uptime:read`  | Get check history                         | Query: `from`, `to`, `limit`           | `{ data: Check[], total }`                |
| GET    | `/:id/stats`        | `monitoring:uptime:read`  | Get uptime statistics                     | --                                     | Stats object with percentiles             |
| GET    | `/:id/daily-stats`  | `monitoring:uptime:read`  | Daily aggregation from ClickHouse         | Query: `days` (default 90, max 365)    | `{ monitorId, days: [] }`                 |
| GET    | `/:id/hourly-stats` | `monitoring:uptime:read`  | Hourly aggregation from ClickHouse        | Query: `hours` (default 24, max 2160)  | `{ monitorId, hours: [] }`                |
| GET    | `/:id/ssl-trend`    | `monitoring:uptime:read`  | SSL days-remaining trend                  | Query: `hours` (default 168, max 8760) | `{ monitorId, points: [] }`               |
| POST   | `/test`             | `monitoring:uptime:read`  | Test monitor URL without saving           | `TestMonitorDto`                       | Check result                              |

### List Monitors Query Parameters

| Parameter  | Type                 | Required | Description                                                                |
| ---------- | -------------------- | -------- | -------------------------------------------------------------------------- |
| `status`   | `enum MonitorStatus` | No       | Filter by status: `up`, `down`, `degraded`, `paused`, `pending`, `unknown` |
| `type`     | `enum MonitorType`   | No       | Filter by type: `http`, `https`, `tcp`, `ping`, `dns`, etc.                |
| `group_id` | `string (UUID)`      | No       | Filter by monitor group                                                    |
| `page`     | `number`             | No       | Page number (default: 1)                                                   |
| `limit`    | `number`             | No       | Items per page (default: 20)                                               |

### CreateMonitorDto

```typescript
{
  name: string;                       // Required
  url: string;                        // Required
  type?: MonitorType;                 // Default: "https"
  description?: string;
  interval?: number;                  // Seconds, default: 60
  timeout?: number;                   // Seconds, default: 30
  retries?: number;                   // Default: 3
  http_config?: {
    method?: string;                  // GET, POST, PUT, etc.
    headers?: Record<string, string>;
    body?: string;
    accepted_status_codes?: number[];
    max_redirects?: number;
    ignore_tls_errors?: boolean;
  };
  ssl_config?: {
    expiry_days_warning?: number;
  };
  notification_channels?: string[];   // Channel IDs
  tags?: string[];
  group_id?: string;
  metadata?: Record<string, unknown>;
}
```

### MonitorResponseDto

```typescript
{
  id: string;
  name: string;
  url: string;
  type: MonitorType;
  status: MonitorStatus;
  description?: string;
  interval: number;
  timeout: number;
  retries: number;
  is_active: boolean;
  is_paused: boolean;
  uptime_stats?: {
    uptime_24h: number;
    uptime_7d: number;
    uptime_30d: number;
    uptime_90d: number;
    avg_response_time_24h: number;
  };
  last_check_at?: string;
  last_response_time?: number;
  consecutive_down_count: number;
  consecutive_up_count: number;
  ssl_cert?: {
    valid: boolean;
    issuer?: string;
    subject?: string;
    valid_from?: string;
    valid_to?: string;
    days_until_expiry?: number;
    protocol?: string;
    cipher?: string;
  };
  tags: string[];
  group_id?: string;
  organization_id: string;
  workspace_id?: string;
  created_at: string;
  updated_at: string;
}
```

---

## Status Pages

Base path: `/api/v2/status-pages`

### Authenticated Endpoints

| Method | Path                                 | Permission                     | Description                           |
| ------ | ------------------------------------ | ------------------------------ | ------------------------------------- |
| GET    | `/`                                  | `monitoring:status-page:read`  | List status pages                     |
| GET    | `/:id`                               | `monitoring:status-page:read`  | Get status page by ID or slug         |
| POST   | `/`                                  | --                             | Create status page                    |
| PUT    | `/:id`                               | --                             | Update status page                    |
| DELETE | `/:id`                               | --                             | Delete status page (204)              |
| POST   | `/:id/monitors`                      | --                             | Add monitor to status page            |
| PUT    | `/:id/monitors/:monitorId`           | --                             | Update monitor config on status page  |
| DELETE | `/:id/monitors/:monitorId`           | --                             | Remove monitor from status page (204) |
| GET    | `/:id/incidents`                     | `monitoring:status-page:read`  | List incidents                        |
| POST   | `/:id/incidents`                     | --                             | Create incident                       |
| PUT    | `/:id/incidents/:incidentId`         | --                             | Update incident                       |
| POST   | `/:id/incidents/:incidentId/updates` | --                             | Add incident update                   |
| POST   | `/:id/incidents/:incidentId/resolve` | --                             | Resolve incident                      |
| GET    | `/:id/subscribers`                   | `monitoring:status-page:read`  | List subscribers                      |
| POST   | `/:id/subscribers`                   | `monitoring:status-page:write` | Add subscriber (admin)                |
| DELETE | `/:id/subscribers/:subscriberId`     | `monitoring:status-page:write` | Remove subscriber (204)               |
| POST   | `/:id/custom-domain`                 | --                             | Set custom domain                     |
| POST   | `/:id/custom-domain/verify`          | --                             | Verify custom domain ownership        |
| DELETE | `/:id/custom-domain`                 | --                             | Remove custom domain (204)            |

### Public Endpoints (No Authentication)

Base path: `/api/v2/public/status`

| Method | Path                           | Description                           |
| ------ | ------------------------------ | ------------------------------------- |
| GET    | `/:slug`                       | Get public status page with incidents |
| POST   | `/:slug/subscribe`             | Subscribe to status page updates      |
| GET    | `/confirm-subscription?token=` | Confirm email subscription            |
| GET    | `/unsubscribe?token=`          | Unsubscribe from notifications        |

---

## Authentication

Base path: `/api/v2/auth`

| Method | Path                      | Auth Required | Description                                 |
| ------ | ------------------------- | ------------- | ------------------------------------------- |
| POST   | `/register`               | No            | Register new account                        |
| POST   | `/login`                  | No            | Login (rate limited: 5/15min per IP)        |
| POST   | `/mfa/verify`             | No            | Verify MFA TOTP code (rate limited)         |
| POST   | `/refresh`                | No            | Refresh access token                        |
| POST   | `/logout`                 | Yes           | Invalidate session and tokens               |
| GET    | `/me`                     | Yes           | Get current user profile                    |
| POST   | `/change-password`        | Yes           | Change password                             |
| GET    | `/mfa/setup`              | Yes           | Generate MFA secret and QR code             |
| POST   | `/mfa/enable`             | Yes           | Enable MFA after TOTP verification          |
| POST   | `/mfa/disable`            | Yes           | Disable MFA (requires password)             |
| GET    | `/verify-email/:token`    | No            | Verify email address                        |
| POST   | `/verify-email/resend`    | No            | Resend verification email                   |
| POST   | `/password-reset/request` | No            | Request password reset (rate limited: 3/hr) |
| POST   | `/password-reset/confirm` | No            | Confirm password reset with token           |
| POST   | `/oauth/login`            | No            | Initiate OAuth login (Google/GitHub)        |
| POST   | `/oauth/callback`         | No            | Handle OAuth callback                       |
| POST   | `/sso/login`              | No            | Initiate SSO login (SAML/OIDC)              |
| POST   | `/sso/callback`           | No            | Handle SSO callback                         |
| GET    | `/devices`                | Yes           | List known devices                          |
| DELETE | `/devices/:id`            | Yes           | Revoke device                               |
| GET    | `/sessions`               | Yes           | List active sessions                        |
| DELETE | `/sessions/:id`           | Yes           | Revoke session                              |
| DELETE | `/sessions`               | Yes           | Revoke all sessions                         |
| POST   | `/invites`                | Super Admin   | Create invite token                         |

### Login Response

On successful login, the response includes:

```json
{
  "accessToken": "eyJ...",
  "refreshToken": "eyJ...",
  "expiresIn": 900,
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "johndoe",
    "firstName": "John",
    "lastName": "Doe",
    "isEmailVerified": true,
    "mfaEnabled": false,
    "role": "administrator",
    "organizationId": "org-1234567890"
  }
}
```

If MFA is enabled, the response includes `mfaRequired: true` with a `mfaToken` instead of tokens.

---

## IAM (Identity and Access Management)

Base path: `/api/v2/iam`

### Users (`/iam/users`)

| Method | Path   | Permission       | Description        |
| ------ | ------ | ---------------- | ------------------ |
| GET    | `/`    | `iam:user:read`  | List users         |
| GET    | `/:id` | `iam:user:read`  | Get user by ID     |
| POST   | `/`    | `iam:user:write` | Create user        |
| PUT    | `/:id` | `iam:user:write` | Update user        |
| DELETE | `/:id` | `iam:user:write` | Delete user (soft) |

### Roles (`/iam/roles`)

| Method | Path   | Permission       | Description    |
| ------ | ------ | ---------------- | -------------- |
| GET    | `/`    | `iam:role:read`  | List roles     |
| GET    | `/:id` | `iam:role:read`  | Get role by ID |
| POST   | `/`    | `iam:role:write` | Create role    |
| PUT    | `/:id` | `iam:role:write` | Update role    |
| DELETE | `/:id` | `iam:role:write` | Delete role    |

### Permissions (`/iam/permissions`)

| Method | Path   | Permission            | Description          |
| ------ | ------ | --------------------- | -------------------- |
| GET    | `/`    | `iam:permission:read` | List all permissions |
| GET    | `/:id` | `iam:permission:read` | Get permission by ID |

### Organizations (`/iam/organizations`)

| Method | Path   | Permission               | Description         |
| ------ | ------ | ------------------------ | ------------------- |
| GET    | `/`    | `iam:organization:read`  | List organizations  |
| GET    | `/:id` | `iam:organization:read`  | Get organization    |
| POST   | `/`    | `iam:organization:write` | Create organization |
| PUT    | `/:id` | `iam:organization:write` | Update organization |
| DELETE | `/:id` | `iam:organization:write` | Delete organization |

### Workspaces (`/iam/workspaces`)

| Method | Path   | Permission            | Description      |
| ------ | ------ | --------------------- | ---------------- |
| GET    | `/`    | `iam:workspace:read`  | List workspaces  |
| GET    | `/:id` | `iam:workspace:read`  | Get workspace    |
| POST   | `/`    | `iam:workspace:write` | Create workspace |
| PUT    | `/:id` | `iam:workspace:write` | Update workspace |
| DELETE | `/:id` | `iam:workspace:write` | Delete workspace |

### Tenants (`/iam/tenants`)

| Method | Path   | Permission         | Description   |
| ------ | ------ | ------------------ | ------------- |
| GET    | `/`    | `iam:tenant:read`  | List tenants  |
| GET    | `/:id` | `iam:tenant:read`  | Get tenant    |
| POST   | `/`    | `iam:tenant:write` | Create tenant |
| PUT    | `/:id` | `iam:tenant:write` | Update tenant |
| DELETE | `/:id` | `iam:tenant:write` | Delete tenant |

### Groups (`/iam/groups`)

| Method | Path   | Permission        | Description  |
| ------ | ------ | ----------------- | ------------ |
| GET    | `/`    | `iam:group:read`  | List groups  |
| GET    | `/:id` | `iam:group:read`  | Get group    |
| POST   | `/`    | `iam:group:write` | Create group |
| PUT    | `/:id` | `iam:group:write` | Update group |
| DELETE | `/:id` | `iam:group:write` | Delete group |

### Regions (`/iam/regions`)

| Method | Path   | Permission         | Description   |
| ------ | ------ | ------------------ | ------------- |
| GET    | `/`    | `iam:region:read`  | List regions  |
| GET    | `/:id` | `iam:region:read`  | Get region    |
| POST   | `/`    | `iam:region:write` | Create region |
| PUT    | `/:id` | `iam:region:write` | Update region |
| DELETE | `/:id` | `iam:region:write` | Delete region |

---

## Alerting

Base path: `/api/v2/alerting`

### Alert Rules (`/alerting/rules`)

| Method | Path   | Permission            | Description       |
| ------ | ------ | --------------------- | ----------------- |
| GET    | `/`    | `alerting:rule:read`  | List alert rules  |
| GET    | `/:id` | `alerting:rule:read`  | Get alert rule    |
| POST   | `/`    | `alerting:rule:write` | Create alert rule |
| PUT    | `/:id` | `alerting:rule:write` | Update alert rule |
| DELETE | `/:id` | `alerting:rule:write` | Delete alert rule |

### Alert Instances (`/alerting/instances`)

| Method | Path               | Permission                | Description          |
| ------ | ------------------ | ------------------------- | -------------------- |
| GET    | `/`                | `alerting:instance:read`  | List alert instances |
| GET    | `/:id`             | `alerting:instance:read`  | Get alert instance   |
| POST   | `/:id/acknowledge` | `alerting:instance:write` | Acknowledge alert    |
| POST   | `/:id/resolve`     | `alerting:instance:write` | Resolve alert        |

### Notification Channels (`/alerting/channels`)

| Method | Path        | Permission               | Description                |
| ------ | ----------- | ------------------------ | -------------------------- |
| GET    | `/`         | `alerting:channel:read`  | List notification channels |
| GET    | `/:id`      | `alerting:channel:read`  | Get channel                |
| POST   | `/`         | `alerting:channel:write` | Create channel             |
| PUT    | `/:id`      | `alerting:channel:write` | Update channel             |
| DELETE | `/:id`      | `alerting:channel:write` | Delete channel             |
| POST   | `/:id/test` | `alerting:channel:write` | Test channel               |

---

## System

### API Keys (`/api/v2/api-keys`)

| Method | Path   | Permission | Description    |
| ------ | ------ | ---------- | -------------- |
| GET    | `/`    | --         | List API keys  |
| POST   | `/`    | --         | Create API key |
| DELETE | `/:id` | --         | Revoke API key |

### SSO Configuration (`/api/v2/sso`)

| Method | Path             | Permission | Description         |
| ------ | ---------------- | ---------- | ------------------- |
| GET    | `/providers`     | --         | List SSO providers  |
| POST   | `/providers`     | --         | Create SSO provider |
| PUT    | `/providers/:id` | --         | Update SSO provider |
| DELETE | `/providers/:id` | --         | Delete SSO provider |

### Audit Logs (`/api/v2/audit`)

| Method | Path          | Permission       | Description          |
| ------ | ------------- | ---------------- | -------------------- |
| GET    | `/logs`       | `platform:audit` | Query audit logs     |
| GET    | `/logs/stats` | `platform:audit` | Audit log statistics |

### Data Masking (`/api/v2/data-masking`)

| Method | Path         | Permission          | Description         |
| ------ | ------------ | ------------------- | ------------------- |
| GET    | `/rules`     | `data-masking:read` | List masking rules  |
| POST   | `/rules`     | --                  | Create masking rule |
| PUT    | `/rules/:id` | --                  | Update masking rule |
| DELETE | `/rules/:id` | --                  | Delete masking rule |

### Retention Policies (`/api/v2/retention`)

| Method | Path            | Permission | Description             |
| ------ | --------------- | ---------- | ----------------------- |
| GET    | `/policies`     | --         | List retention policies |
| PUT    | `/policies/:id` | --         | Update retention policy |

### LLM Providers (`/api/v2/llm`)

| Method | Path             | Permission | Description        |
| ------ | ---------------- | ---------- | ------------------ |
| GET    | `/providers`     | --         | List LLM providers |
| POST   | `/providers`     | --         | Add LLM provider   |
| PUT    | `/providers/:id` | --         | Update provider    |
| DELETE | `/providers/:id` | --         | Remove provider    |
| POST   | `/chat`          | --         | Send chat message  |
| GET    | `/insights`      | --         | Get AI insights    |

### Notification Settings (`/api/v2/notifications`)

| Method | Path        | Permission | Description                  |
| ------ | ----------- | ---------- | ---------------------------- |
| GET    | `/settings` | --         | Get notification settings    |
| PUT    | `/settings` | --         | Update notification settings |

---

## Health Check

| Method | Path            | Auth | Description          |
| ------ | --------------- | ---- | -------------------- |
| GET    | `/health`       | No   | Service health check |
| GET    | `/health/live`  | No   | Liveness probe       |
| GET    | `/health/ready` | No   | Readiness probe      |

---

## Rate Limiting

The following endpoints have rate limiting applied:

| Endpoint                            | Limit        | Window     | Key        |
| ----------------------------------- | ------------ | ---------- | ---------- |
| `POST /auth/login`                  | 5 requests   | 15 minutes | IP address |
| `POST /auth/mfa/verify`             | 5 requests   | 15 minutes | IP address |
| `POST /auth/password-reset/request` | 3 requests   | 1 hour     | Email      |
| Global API throttle                 | 500 requests | 60 seconds | IP address |

Rate limiting is skipped in development mode (`NODE_ENV=development`).
