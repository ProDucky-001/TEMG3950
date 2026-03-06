export interface VoiceClassificationResult {
  label: 'human' | 'ai'
  prob_human: number
  prob_ai: number
  checkpoint_loaded: boolean
}
