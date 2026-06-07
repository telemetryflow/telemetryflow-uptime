# Requirements Document

## Introduction

This document specifies the requirements for integrating the uptime monitoring frontend with the existing backend QueryUptime handlers in the TelemetryFlow platform monolith. The integration will enable users to view uptime monitors, check results, availability metrics, and incident history through a comprehensive frontend interface that communicates with the backend API.

## Glossary

- **Uptime_Monitor**: A configured monitoring endpoint that periodically checks the availability and response time of a target URL or service
- **Check_Result**: The outcome of a single monitoring check, including status (success/failure/timeout/error), response time, and timestamp
- **Availability_Metric**: Calculated statistics showing uptime percentage, average response time, and latency percentiles over specific time ranges
- **Monitor_Type**: The protocol used for monitoring (HTTP, TCP, ICMP, DNS)
- **Check_Status**: The result status of a check (success, failure, timeout, error)
- **Latency_Percentile**: Statistical measure of response time distribution (P50, P75, P90, P95, P99) in milliseconds
- **Frontend**: The React-based user interface component of the TelemetryFlow platform
- **Backend**: The NestJS-based API server with QueryUptime handlers
- **Tenant_Context**: Organization and workspace identifiers that scope data access

## Requirements

### Requirement 1: Display Uptime Monitors List

**User Story:** As a user, I want to view a list of all uptime monitors in my workspace, so that I can see the status and configuration of my monitoring endpoints.

#### Acceptance Criteria

1. WHEN a user navigates to the uptime monitoring page, THE Frontend SHALL fetch and display all uptime monitors for the current tenant context
2. WHEN displaying monitors, THE Frontend SHALL show monitor name, URL, type, current status, and last check time
3. WHEN the monitor list is empty, THE Frontend SHALL display a message indicating no monitors are configured
4. WHEN a user filters monitors by name, THE Frontend SHALL send the filter criteria to the Backend and display matching results
5. WHEN a user filters monitors by type, THE Frontend SHALL send the type filter to the Backend and display matching results
6. WHEN a user filters monitors by status, THE Frontend SHALL send the status filter to the Backend and display matching results
7. WHEN pagination is needed, THE Frontend SHALL request paginated data from the Backend with appropriate page and limit parameters

### Requirement 2: Display Monitor Details

**User Story:** As a user, I want to view detailed information about a specific uptime monitor, so that I can understand its configuration and current state.

#### Acceptance Criteria

1. WHEN a user selects a monitor from the list, THE Frontend SHALL fetch detailed monitor information from the Backend using the monitor ID
2. WHEN displaying monitor details, THE Frontend SHALL show all configuration fields including name, URL, type, interval, timeout, and active status
3. WHEN the monitor is paused, THE Frontend SHALL display a visual indicator showing the paused state
4. WHEN the monitor has tags, THE Frontend SHALL display all associated tags
5. IF the monitor does not exist or the user lacks access, THEN THE Frontend SHALL display an appropriate error message

### Requirement 3: Display Availability Metrics with Latency Percentiles

**User Story:** As a user, I want to see uptime percentages and response time statistics including latency percentiles, so that I can assess the reliability and performance of my monitored endpoints.

#### Acceptance Criteria

1. WHEN displaying monitor statistics, THE Frontend SHALL fetch and show uptime percentage for 24 hours, 7 days, 30 days, and 90 days
2. WHEN displaying response time metrics, THE Frontend SHALL show average, minimum, and maximum response times in milliseconds
3. WHEN displaying latency percentiles, THE Frontend SHALL show P50, P75, P90, P95, and P99 latency values in milliseconds
4. WHEN the monitor has no check history, THE Frontend SHALL display zero or N/A for all metrics
5. WHEN metrics are loading, THE Frontend SHALL display loading indicators for each metric section
6. THE Frontend SHALL format uptime percentages with up to 4 decimal places for precision
7. THE Frontend SHALL format response times and latency percentiles as whole numbers in milliseconds

### Requirement 4: Display Check History with Response Time Trends

**User Story:** As a user, I want to view the history of monitoring checks with response time trends, so that I can identify patterns and investigate incidents.

#### Acceptance Criteria

1. WHEN displaying check history, THE Frontend SHALL fetch check results from the Backend with appropriate time range parameters
2. WHEN displaying individual checks, THE Frontend SHALL show timestamp, status, response time, and any error messages
3. WHEN rendering check history, THE Frontend SHALL display checks in reverse chronological order (newest first)
4. WHEN a user specifies a time range, THE Frontend SHALL request checks within that range from the Backend
5. WHEN displaying response time trends, THE Frontend SHALL render a visual chart showing response times over time
6. WHEN the check history exceeds the display limit, THE Frontend SHALL implement pagination or infinite scroll
7. THE Frontend SHALL limit initial check history requests to 100 results as specified by the Backend default

### Requirement 5: Real-Time Monitor Status Updates

**User Story:** As a user, I want to see real-time updates when monitor status changes, so that I can respond quickly to incidents.

#### Acceptance Criteria

1. WHEN a monitor status changes, THE Frontend SHALL update the displayed status without requiring a manual refresh
2. WHEN implementing real-time updates, THE Frontend SHALL use polling or WebSocket connections to receive status changes
3. WHEN polling for updates, THE Frontend SHALL request updated monitor data at regular intervals (not exceeding once per 30 seconds)
4. WHEN a monitor transitions from up to down, THE Frontend SHALL provide a visual indication of the status change
5. WHEN a monitor transitions from down to up, THE Frontend SHALL provide a visual indication of the status change
6. THE Frontend SHALL update check history automatically when new checks are available

### Requirement 6: Support Multiple Monitor Types

**User Story:** As a user, I want to view monitors of different types (HTTP, TCP, ICMP, DNS), so that I can monitor various service protocols.

#### Acceptance Criteria

1. WHEN displaying a monitor, THE Frontend SHALL show the monitor type (HTTP, TCP, ICMP, or DNS)
2. WHEN filtering monitors, THE Frontend SHALL allow filtering by monitor type
3. WHEN displaying type-specific configuration, THE Frontend SHALL show relevant fields for each monitor type
4. THE Frontend SHALL use consistent visual indicators for each monitor type across all views

### Requirement 7: Handle Backend API Errors Gracefully

**User Story:** As a user, I want to see clear error messages when the backend is unavailable or returns errors, so that I understand what went wrong.

#### Acceptance Criteria

1. WHEN the Backend returns a 404 error for a monitor, THE Frontend SHALL display a "Monitor not found" message
2. WHEN the Backend returns a 401 or 403 error, THE Frontend SHALL display an authentication or authorization error message
3. WHEN the Backend returns a 500 error, THE Frontend SHALL display a generic server error message
4. WHEN a network request fails, THE Frontend SHALL display a connection error message
5. WHEN an error occurs, THE Frontend SHALL provide an option to retry the failed request
6. THE Frontend SHALL log all API errors to the console for debugging purposes

### Requirement 8: Integrate with Existing Backend Query Handlers

**User Story:** As a developer, I want the frontend to use the existing QueryUptime handlers, so that we maintain consistency with the backend architecture.

#### Acceptance Criteria

1. THE Frontend SHALL call the QueryUptimeMonitors endpoint to retrieve the list of monitors
2. THE Frontend SHALL call the GetUptimeMonitorById endpoint to retrieve individual monitor details
3. THE Frontend SHALL call the GetUptimeMonitorStats endpoint to retrieve availability metrics and latency percentiles
4. THE Frontend SHALL call the GetUptimeMonitorChecks endpoint to retrieve check history
5. THE Frontend SHALL include tenant context (organizationId and workspaceId) in all API requests
6. THE Frontend SHALL handle pagination parameters (page, limit, offset) according to the Backend API specification
7. THE Frontend SHALL send filter parameters (name, url, type, status, isActive, isPaused, groupId, tags) in the format expected by the Backend

### Requirement 9: Display Incident History

**User Story:** As a user, I want to see a history of incidents when monitors went down, so that I can track reliability over time.

#### Acceptance Criteria

1. WHEN displaying incident history, THE Frontend SHALL identify periods where check status was failure, timeout, or error
2. WHEN an incident is detected, THE Frontend SHALL show the start time, end time, and duration of the incident
3. WHEN displaying incidents, THE Frontend SHALL show the total number of incidents in each time range (24h, 7d, 30d, 90d)
4. WHEN an incident is ongoing, THE Frontend SHALL indicate that the incident has not yet resolved
5. WHEN displaying incident details, THE Frontend SHALL show affected checks and error messages from that period

### Requirement 10: Calculate and Display Latency Percentiles

**User Story:** As a developer, I want the system to calculate latency percentiles from check history using ClickHouse materialized views, so that users can understand response time distribution efficiently.

#### Acceptance Criteria

1. WHEN calculating latency percentiles, THE Backend SHALL compute P50, P75, P90, P95, and P99 from response time data stored in ClickHouse materialized views
2. WHEN insufficient data exists for percentile calculation, THE Backend SHALL return null or zero for percentile values
3. THE Backend SHALL calculate percentiles for each time range (24h, 7d, 30d, 90d) independently using the uptime_checks_1h materialized view
4. THE Backend SHALL use response_time values from uptime_checks table for raw data and uptime_checks_1h for aggregated percentiles
5. THE Backend SHALL exclude failed, timeout, and error checks from percentile calculations (only include successful checks)
6. THE Backend SHALL use ClickHouse's quantileMerge function to efficiently compute percentiles from pre-aggregated quantileState values
