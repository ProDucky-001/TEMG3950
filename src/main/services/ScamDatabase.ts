import type { StoreClass } from '../storeLoader'
import { logger } from './logger'
import type {
  ScamDatabaseSchema,
  KnownDomainEntry,
  RecentDetectionEntry,
  ThreatType,
} from '../../shared/link-detection-types'

const DB_VERSION = 1
const MAX_RECENT_DETECTIONS = 500

const DEFAULT_PHISHING_KEYWORDS = [
  'login',
  'signin',
  'account',
  'verify',
  'secure',
  'password',
  'credential',
  'banking',
  'paypal',
  'amazon',
  'microsoft',
  'apple',
  'google',
  'facebook',
  'netflix',
  'suspended',
  'locked',
  'confirm',
  'update',
  'phishing',
]

const DEFAULT_SCAM_PHRASES = [
  'act now',
  'limited time',
  'urgent',
  'immediately',
  'click here',
  'verify your account',
  'suspended account',
  'unusual activity',
  'wire transfer',
  'send money',
  'bitcoin',
  'crypto',
  'prize',
  'winner',
  'lottery',
  'congratulations',
  'claim your',
  'free gift',
  'inheritance',
  'tax refund',
  'irs',
  'nigerian',
  'western union',
  'money gram',
]

const SUSPICIOUS_TLDS = new Set([
  '.tk',
  '.ml',
  '.ga',
  '.cf',
  '.gq',
  '.xyz',
  '.top',
  '.work',
  '.click',
  '.link',
  '.cc',
  '.ru',
  '.cn',
])

export class ScamDatabase {
  private store: InstanceType<StoreClass>

  constructor(Store: StoreClass) {
    this.store = new Store({
      name: 'scamshield-scam-db',
      defaults: this.getDefaultSchema(),
    }) as InstanceType<StoreClass>
  }

  private getDefaultSchema(): ScamDatabaseSchema {
    return {
      version: DB_VERSION,
      knownMaliciousDomains: [],
      phishingKeywords: [...DEFAULT_PHISHING_KEYWORDS],
      scamPhrases: [...DEFAULT_SCAM_PHRASES],
      recentDetections: [],
      lastUpdated: Date.now(),
    }
  }

  getKnownMaliciousDomains(): KnownDomainEntry[] {
    return this.store.get('knownMaliciousDomains', [])
  }

  isDomainKnownMalicious(domain: string): KnownDomainEntry | undefined {
    const normalized = domain.toLowerCase().replace(/^www\./, '')
    return this.getKnownMaliciousDomains().find(
      (e) => e.domain.toLowerCase().replace(/^www\./, '') === normalized
    )
  }

  addMaliciousDomain(domain: string, threatType: ThreatType, source?: string): void {
    const normalized = domain.toLowerCase().replace(/^www\./, '')
    if (this.isDomainKnownMalicious(normalized)) return
    try {
      const list = this.getKnownMaliciousDomains()
      list.push({
        domain: normalized,
        threatType,
        firstSeen: Date.now(),
        source,
      })
      this.store.set('knownMaliciousDomains', list)
      this.store.set('lastUpdated', Date.now())
    } catch (err) {
      logger.error('ScamDatabase: failed to add malicious domain', normalized, err)
    }
  }

  getPhishingKeywords(): string[] {
    return this.store.get('phishingKeywords', DEFAULT_PHISHING_KEYWORDS)
  }

  getScamPhrases(): string[] {
    return this.store.get('scamPhrases', DEFAULT_SCAM_PHRASES)
  }

  addPhishingKeyword(keyword: string): void {
    const kw = keyword.toLowerCase().trim()
    const list = this.getPhishingKeywords()
    if (list.includes(kw)) return
    list.push(kw)
    this.store.set('phishingKeywords', list)
    this.store.set('lastUpdated', Date.now())
  }

  addScamPhrase(phrase: string): void {
    const p = phrase.toLowerCase().trim()
    const list = this.getScamPhrases()
    if (list.includes(p)) return
    list.push(p)
    this.store.set('scamPhrases', list)
    this.store.set('lastUpdated', Date.now())
  }

  getRecentDetections(): RecentDetectionEntry[] {
    return this.store.get('recentDetections', [])
  }

  addRecentDetection(entry: Omit<RecentDetectionEntry, 'detectedAt'>): void {
    try {
      const list = this.getRecentDetections()
      list.unshift({
        ...entry,
        detectedAt: Date.now(),
      })
      const trimmed = list.slice(0, MAX_RECENT_DETECTIONS)
      this.store.set('recentDetections', trimmed)
    } catch (err) {
      logger.error('ScamDatabase: failed to add recent detection', err)
    }
  }

  isSuspiciousTld(tld: string): boolean {
    let normalized = tld.toLowerCase()
    if (!normalized.startsWith('.')) normalized = '.' + normalized
    return SUSPICIOUS_TLDS.has(normalized)
  }

  getSuspiciousTlds(): Set<string> {
    return new Set(SUSPICIOUS_TLDS)
  }

  getLastUpdated(): number {
    return this.store.get('lastUpdated', 0)
  }

  updateFromThreatIntelligence(update: Partial<ScamDatabaseSchema>): void {
    if (update.knownMaliciousDomains != null)
      this.store.set('knownMaliciousDomains', update.knownMaliciousDomains)
    if (update.phishingKeywords != null)
      this.store.set('phishingKeywords', update.phishingKeywords)
    if (update.scamPhrases != null)
      this.store.set('scamPhrases', update.scamPhrases)
    if (update.recentDetections != null)
      this.store.set('recentDetections', update.recentDetections)
    this.store.set('lastUpdated', Date.now())
  }

  reset(): ScamDatabaseSchema {
    const defaults = this.getDefaultSchema()
    this.store.set('knownMaliciousDomains', defaults.knownMaliciousDomains)
    this.store.set('phishingKeywords', defaults.phishingKeywords)
    this.store.set('scamPhrases', defaults.scamPhrases)
    this.store.set('recentDetections', defaults.recentDetections)
    this.store.set('lastUpdated', defaults.lastUpdated)
    this.store.set('version', defaults.version)
    return defaults
  }
}
