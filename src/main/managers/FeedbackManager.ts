import type { StoreClass } from '../storeLoader'
import type { FalsePositiveReport, FeedbackStoreSchema } from '../../shared/feedback-types'
import { logger } from '../services/logger'

const MAX_REPORTS = 200

export class FeedbackManager {
  private store: InstanceType<StoreClass>

  constructor(Store: StoreClass) {
    this.store = new Store({
      name: 'scamshield-feedback',
      defaults: {
        falsePositiveReports: [],
        usageStatsOptIn: { enabled: false, updatedAt: 0 },
      },
    }) as InstanceType<StoreClass>
  }

  reportFalsePositive(alertId: string, kind: 'false_positive' | 'help_improve' | 'other', comment?: string): void {
    try {
      const list = this.store.get('falsePositiveReports', [])
      list.unshift({
        alertId,
        kind,
        comment,
        reportedAt: Date.now(),
      })
      this.store.set('falsePositiveReports', list.slice(0, MAX_REPORTS))
    } catch (err) {
      logger.warn('FeedbackManager: reportFalsePositive failed', err)
    }
  }

  getFalsePositiveReports(): FalsePositiveReport[] {
    return this.store.get('falsePositiveReports', [])
  }

  setUsageStatsOptIn(enabled: boolean): void {
    this.store.set('usageStatsOptIn', { enabled, updatedAt: Date.now() })
  }

  isUsageStatsOptIn(): boolean {
    return this.store.get('usageStatsOptIn', { enabled: false, updatedAt: 0 }).enabled
  }
}
