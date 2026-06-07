# Implementation Plan: Uptime Monitoring Frontend-Backend Integration

## Overview

This implementation plan breaks down the uptime monitoring integration into discrete coding tasks. The approach follows a bottom-up strategy: first extending the backend to support latency percentiles, then building frontend API integration, followed by UI components, and finally wiring everything together with real-time updates.

## Tasks

- [ ] 1. Extend backend GetUptimeMonitorStatsHandler to use ClickHouse materialized views
  - Update handler to query uptime_checks_1d materialized view for uptime percentages
  - Update handler to query uptime_checks_1h materialized view for response time stats
  - Add calculatePercentiles method using quantileMerge on uptime_checks_1h view
  - Extend execute method to call calculatePercentiles for each time range (24h, 7d, 30d, 90d)
  - Update response DTO to include percentiles24h, percentiles7d, percentiles30d, percentiles90d objects
  - Handle edge case where no successful checks exist (return zeros)
  - Implement hybrid PG+CH architecture: verify monitor in PG, fetch stats from CH
  - _Requirements: 10.1, 10.2, 10.3, 10.5, 10.6_

- [ ] 1.1 Write property test for percentile calculation
  - **Property 26: Backend Percentile Calculation**
  - **Validates: Requirements 10.1, 10.5**

- [ ] 1.2 Write property test for independent time range calculations
  - **Property 27: Independent Percentile Calculation per Time Range**
  - **Validates: Requirements 10.3**

- [ ] 1.3 Write unit test for empty dataset handling
  - Test that null/zero percentiles are returned when no successful checks exist
  - _Requirements: 10.2_

- [ ] 2. Update frontend TypeScript types for extended stats
  - Add LatencyPercentiles interface with p50, p75, p90, p95, p99 fields
  - Extend UptimeStats interface to include percentiles24h, percentiles7d, percentiles30d, percentiles90d
  - Update transformMonitor function to handle new percentile fields
  - _Requirements: 3.3, 10.1_

- [ ] 3. Update frontend API client to fetch extended stats
  - Modify getMonitorStats method in uptime.ts to handle new percentile fields
  - Update mock data generator to include percentile values
  - Add response transformation for snake_case to camelCase conversion
  - _Requirements: 8.3_

- [ ] 3.1 Write property test for API client stats fetching
  - **Property 7: Stats Fetching with All Time Ranges**
  - **Validates: Requirements 3.1, 3.2, 8.3**

- [ ] 4. Create Pinia store for uptime monitoring state
  - Create store/uptime.ts with state for monitors, selectedMonitor, stats, checks, filters, pagination
  - Implement fetchMonitors action with filter and pagination support
  - Implement fetchMonitorDetails action
  - Implement fetchMonitorStats action
  - Implement fetchMonitorChecks action with time range support
  - Add error handling state and actions
  - Add loading state management
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 8.1, 8.2, 8.3, 8.4_

- [ ] 4.1 Write property test for tenant context inclusion
  - **Property 1: Monitor List Fetching with Tenant Context**
  - **Validates: Requirements 1.1, 8.1, 8.5**

- [ ] 4.2 Write property test for filter parameter transmission
  - **Property 3: Filter Parameter Transmission**
  - **Validates: Requirements 1.4, 1.5, 1.6, 6.2, 8.7**

- [ ] 5. Implement error handling composable
  - Create composables/useApiError.ts with handleError and logError functions
  - Implement error categorization (404, 401/403, 500, network)
  - Add retry logic with exponential backoff
  - Return ErrorInfo objects with type, message, canRetry, shouldRedirect
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [ ] 5.1 Write unit tests for error handling
  - Test 404 error handling
  - Test 401/403 error handling
  - Test 500 error handling
  - Test network error handling
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ] 5.2 Write property test for error logging
  - **Property 21: API Error Logging**
  - **Validates: Requirements 7.6**

- [ ] 5.3 Write property test for retry availability
  - **Property 20: Error Retry Availability**
  - **Validates: Requirements 7.5**

- [ ] 6. Create MonitorCard component
  - Create components/monitoring/MonitorCard.vue
  - Implement props: monitor (Monitor), showStats (boolean)
  - Render monitor name, URL, type icon, status badge
  - Display uptime stats if showStats=true and stats exist
  - Show last check time with relative formatting
  - Emit click event with monitorId
  - Add CSS classes for status-based styling
  - _Requirements: 1.2, 6.1_

- [ ] 6.1 Write property test for monitor display completeness
  - **Property 2: Monitor Display Completeness**
  - **Validates: Requirements 1.2, 2.2, 2.4, 6.1**

- [ ] 7. Create StatsPanel component
  - Create components/monitoring/StatsPanel.vue
  - Implement props: stats (UptimeStats), loading (boolean)
  - Add time range tabs (24h, 7d, 30d, 90d) with selection state
  - Display uptime percentage, avg response time, total checks, failed checks
  - Create latency percentiles section with PercentileBar sub-components
  - Show loading skeletons when loading=true
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 7.1 Write property test for latency percentiles display
  - **Property 8: Latency Percentiles Display**
  - **Validates: Requirements 3.3**

- [ ] 7.2 Write property test for metric formatting
  - **Property 9: Metric Formatting Precision**
  - **Validates: Requirements 3.6, 3.7**

- [ ] 7.3 Write unit test for empty stats display
  - Test that zero or N/A is displayed when no check history exists
  - _Requirements: 3.4_

- [ ] 8. Create CheckHistory component
  - Create components/monitoring/CheckHistory.vue
  - Implement props: checks (UptimeCheck[]), loading (boolean), monitorId (string)
  - Add TimeRangeSelector for filtering checks
  - Render checks table with columns: timestamp, status, response time, status code, region, message
  - Implement pagination or infinite scroll for large datasets
  - Add status-based row styling
  - _Requirements: 4.2, 4.3, 4.6_

- [ ] 8.1 Write property test for check display completeness
  - **Property 11: Check Display Completeness**
  - **Validates: Requirements 4.2**

- [ ] 8.2 Write property test for check sort order
  - **Property 12: Check History Sort Order**
  - **Validates: Requirements 4.3**

- [ ] 8.3 Write property test for check history pagination
  - **Property 14: Check History Pagination**
  - **Validates: Requirements 4.6**

- [ ] 8.4 Write unit test for default limit
  - Test that initial check history requests use limit=100
  - _Requirements: 4.7_

- [ ] 9. Create ResponseTimeChart component
  - Create components/monitoring/ResponseTimeChart.vue
  - Implement props: checks (UptimeCheck[]), height (number), showPercentiles (boolean)
  - Use Chart.js or ECharts (following existing TelemetryFlow patterns)
  - Configure line chart with time on x-axis, response time on y-axis
  - Add color coding: green (success), yellow (degraded), red (failure/timeout)
  - Add optional percentile lines overlay
  - _Requirements: 4.5_

- [ ] 9.1 Write property test for chart rendering
  - **Property 13: Response Time Chart Rendering**
  - **Validates: Requirements 4.5**

- [ ] 10. Create IncidentTimeline component
  - Create components/monitoring/IncidentTimeline.vue
  - Implement props: monitorId (string), timeRange ('24h' | '7d' | '30d' | '90d')
  - Implement detectIncidents function to identify consecutive failure periods
  - Calculate incident duration, check count, and status (resolved/ongoing)
  - Render incident timeline with start/end times and duration
  - Display affected checks and error messages for each incident
  - Show total incident count for selected time range
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 10.1 Write property test for incident detection
  - **Property 22: Incident Detection from Check Sequence**
  - **Validates: Requirements 9.1**

- [ ] 10.2 Write property test for incident data completeness
  - **Property 23: Incident Data Completeness**
  - **Validates: Requirements 9.2, 9.4**

- [ ] 10.3 Write property test for incident count by time range
  - **Property 24: Incident Count by Time Range**
  - **Validates: Requirements 9.3**

- [ ] 10.4 Write property test for incident detail display
  - **Property 25: Incident Detail Display**
  - **Validates: Requirements 9.5**

- [ ] 11. Create MonitorList view
  - Create views/monitoring/uptime/components/MonitorList.vue
  - Implement filter controls for name, type, status
  - Add pagination controls
  - Use MonitorCard component to display each monitor
  - Implement click handler to navigate to MonitorDetail
  - Add empty state display when no monitors exist
  - Show loading state while fetching
  - Display error messages with retry button
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [ ] 11.1 Write unit test for empty state
  - Test that empty state message is displayed when monitors array is empty
  - _Requirements: 1.3_

- [ ] 11.2 Write property test for pagination handling
  - **Property 4: Pagination Parameter Handling**
  - **Validates: Requirements 1.7, 8.6**

- [ ] 12. Create MonitorDetail view
  - Create views/monitoring/uptime/components/MonitorDetail.vue
  - Fetch monitor details, stats, and checks on mount using monitorId from route params
  - Display monitor configuration fields (name, URL, type, interval, timeout, active status)
  - Show paused indicator when isPaused=true
  - Display tags if present
  - Integrate StatsPanel component for metrics
  - Integrate CheckHistory component for check history
  - Integrate ResponseTimeChart component for trends
  - Integrate IncidentTimeline component for incident history
  - Handle 404 error with redirect to monitor list
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 12.1 Write property test for monitor detail fetching
  - **Property 5: Monitor Detail Fetching**
  - **Validates: Requirements 2.1, 8.2**

- [ ] 12.2 Write property test for paused state visualization
  - **Property 6: Paused State Visualization**
  - **Validates: Requirements 2.3**

- [ ] 12.3 Write unit test for 404 error handling
  - Test that 404 error displays "Monitor not found" and redirects
  - _Requirements: 2.5_

- [ ] 13. Implement real-time polling mechanism
  - Create composables/useMonitorPolling.ts
  - Implement startPolling function with 30-second interval
  - Implement stopPolling function to clear interval
  - Add Page Visibility API integration to pause polling when page hidden
  - Detect status changes by comparing previous and current monitor states
  - Emit status change events for UI notifications
  - Auto-refresh check history when new checks available
  - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.6_

- [ ] 13.1 Write property test for real-time status updates
  - **Property 15: Real-Time Status Updates**
  - **Validates: Requirements 5.1**

- [ ] 13.2 Write property test for polling interval constraint
  - **Property 16: Polling Interval Constraint**
  - **Validates: Requirements 5.3**

- [ ] 13.3 Write property test for status change visualization
  - **Property 17: Status Change Visualization**
  - **Validates: Requirements 5.4, 5.5**

- [ ] 13.4 Write property test for automatic check history refresh
  - **Property 18: Automatic Check History Refresh**
  - **Validates: Requirements 5.6**

- [ ] 14. Add type-specific configuration display logic
  - Update MonitorDetail view to conditionally render type-specific fields
  - Show httpMethod, httpHeaders, httpBody for HTTP/HTTPS monitors
  - Show port for TCP monitors
  - Show DNS record type for DNS monitors
  - Show ping settings for ICMP monitors
  - _Requirements: 6.3_

- [ ] 14.1 Write property test for type-specific configuration display
  - **Property 19: Type-Specific Configuration Display**
  - **Validates: Requirements 6.3**

- [ ] 15. Add router routes for uptime monitoring views
  - Update router/routes.ts to add /monitoring/uptime route for MonitorList
  - Add /monitoring/uptime/:id route for MonitorDetail
  - Configure route guards for authentication
  - Add route meta for breadcrumbs and page titles
  - _Requirements: 1.1, 2.1_

- [ ] 16. Integrate uptime monitoring into main navigation
  - Update SideNav.vue to add "Uptime" menu item
  - Add icon for uptime monitoring section
  - Configure permissions for uptime monitoring access
  - _Requirements: 1.1_

- [ ] 17. Add accessibility features
  - Add ARIA labels to status indicators in MonitorCard and MonitorDetail
  - Implement keyboard navigation for filter controls and pagination
  - Add screen reader announcements for status changes
  - Ensure color contrast meets WCAG AA standards for status colors
  - Add text alternatives for ResponseTimeChart
  - _Requirements: All UI requirements_

- [ ] 18. Checkpoint - Ensure all tests pass
  - Run all unit tests and property tests
  - Verify backend percentile calculation works correctly
  - Verify frontend displays all metrics including percentiles
  - Test real-time polling mechanism
  - Test error handling and retry logic
  - Ask the user if questions arise

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties with minimum 100 iterations
- Unit tests validate specific examples and edge cases
- The implementation follows a bottom-up approach: backend extensions → API client → store → components → views → integration
- Real-time updates are implemented via polling (30-second interval) rather than WebSockets for simplicity
- All components follow existing TelemetryFlow Vue 3 + TypeScript patterns
