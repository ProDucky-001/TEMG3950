/**
 * Email Risk Detection module - public API.
 * ESM/CommonJS compatible (consumers can require() or import).
 */

export { analyzeEmailRisk } from './riskDetector';
export type { RiskAnalysisResult, Finding, EmailRiskInput, RiskLevel } from './types';
export { DEFAULT_WEIGHTS, RISK_LEVEL_THRESHOLDS } from './types';
export { extractUrlsFromText, scoreToRiskLevel } from './utils';
