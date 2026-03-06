// IPC channel names - shared between main and renderer

export const IPC_CHANNELS = {
  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  SETTINGS_RESET: 'settings:reset',

  // Alerts
  ALERTS_GET: 'alerts:get',
  ALERTS_CLEAR: 'alerts:clear',
  ALERTS_GET_LAST_30_DAYS: 'alerts:get-last-30-days',
  ALERTS_GET_STATS: 'alerts:get-stats',
  ALERTS_EXPORT_JSON: 'alerts:export-json',
  ALERTS_EXPORT_CSV: 'alerts:export-csv',

  // Statistics
  STATS_GET: 'stats:get',
  STATS_UPDATE: 'stats:update',

  // Monitoring
  MONITORING_TOGGLE: 'monitoring:toggle',
  MONITORING_STATUS: 'monitoring:status',

  // Windows
  WINDOW_OPEN_DASHBOARD: 'window:open-dashboard',
  WINDOW_OPEN_SETTINGS: 'window:open-settings',
  WINDOW_CLOSE_ALL: 'window:close-all',
  WINDOW_SET_ALWAYS_ON_TOP: 'window:set-always-on-top',
  WINDOW_GET_ALWAYS_ON_TOP: 'window:get-always-on-top',

  // App lifecycle
  APP_QUIT: 'app:quit',
  APP_LAUNCH_AT_STARTUP: 'app:launch-at-startup',

  // Status (main -> renderer)
  STATUS_UPDATE: 'status:update',

  // Link detection
  LINK_SCAN: 'link:scan',

  // AI content detection
  CONTENT_SCAN: 'content:scan',

  // App integration / monitoring
  INTEGRATION_PRIVACY_SUMMARY: 'integration:privacy-summary',
  INTEGRATION_ACCESSIBILITY_CHECK: 'integration:accessibility-check',
  INTEGRATION_ACCESSIBILITY_REQUEST: 'integration:accessibility-request',
  INTEGRATION_APP_MONITOR_STATUS: 'integration:app-monitor-status',

  // User feedback
  FEEDBACK_REPORT_FALSE_POSITIVE: 'feedback:report-false-positive',
  FEEDBACK_GET_OPT_IN: 'feedback:get-opt-in',
  FEEDBACK_SET_OPT_IN: 'feedback:set-opt-in',
} as const
