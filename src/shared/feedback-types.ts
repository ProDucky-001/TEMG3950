/**
 * User feedback types for false positive reporting and optional anonymous stats.
 */

export type FeedbackKind = 'false_positive' | 'help_improve' | 'other';

export interface FalsePositiveReport {
  alertId: string
  kind: FeedbackKind
  comment?: string
  reportedAt: number
}

export interface UsageStatsOptIn {
  enabled: boolean
  updatedAt: number
}

export interface FeedbackStoreSchema {
  falsePositiveReports: FalsePositiveReport[]
  usageStatsOptIn: UsageStatsOptIn
}
