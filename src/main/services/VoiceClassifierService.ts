import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import type { VoiceClassificationResult } from '../../shared/voice-types'

export type { VoiceClassificationResult }

const PYTHON_CMD = process.env.PYTHON_PATH ?? 'python'
const SCRIPT_NAME = 'classify_audio_json.py'

const AUDIOINTELL_SYNTHETIC_URL = 'https://app.audiointell.ai/api/synthetic-detection'

/** Parse AudioIntell prediction e.g. "AI Generated Audio - Likelihood of AI: 99.58%" or "Not AI Generated Audio - Likelihood of AI: 4.34%" */
function parseAudioIntellPrediction(prediction: string): VoiceClassificationResult {
  const match = prediction.match(/Likelihood of AI:\s*([\d.]+)%/i)
  const probAi = match ? Number(match[1]) / 100 : 0.5
  const probHuman = 1 - probAi
  const isAi = /AI Generated Audio/i.test(prediction)
  return {
    label: isAi ? 'ai' : 'human',
    prob_human: probHuman,
    prob_ai: probAi,
    checkpoint_loaded: true,
  }
}

/**
 * Classify audio via AudioIntell.ai Synthetic Detection API.
 * Requires AUDIOINTELL_EMAIL and AUDIOINTELL_PASSWORD in environment (.env).
 * @see https://app.audiointell.ai/api
 */
async function classifyWithAudioIntell(audioPath: string): Promise<VoiceClassificationResult> {
  const email = process.env.AUDIOINTELL_EMAIL?.trim()
  const password = process.env.AUDIOINTELL_PASSWORD

  if (!email || !password) {
    throw new Error('AudioIntell credentials missing. Set AUDIOINTELL_EMAIL and AUDIOINTELL_PASSWORD in .env (see .env.example).')
  }

  const ext = path.extname(audioPath).toLowerCase()
  if (ext !== '.mp3' && ext !== '.wav') {
    throw new Error('AudioIntell only accepts .mp3 or .wav files.')
  }

  const formData = new FormData()
  formData.append('email', email)
  formData.append('password', password)
  formData.append('content_type', 'voice')

  const buffer = fs.readFileSync(audioPath)
  const blob = new Blob([buffer])
  const filename = path.basename(audioPath)
  formData.append('audio', blob, filename)

  const res = await fetch(AUDIOINTELL_SYNTHETIC_URL, {
    method: 'POST',
    body: formData,
  })

  const data = (await res.json()) as { prediction?: string; error?: string }

  if (!res.ok || data.error) {
    throw new Error(data.error ?? `AudioIntell API error: ${res.status}`)
  }

  if (typeof data.prediction !== 'string') {
    throw new Error('Invalid AudioIntell response: missing prediction')
  }

  return parseAudioIntellPrediction(data.prediction)
}

/**
 * Run the Python voice classifier on an audio file.
 * Uses Gustking Wav2Vec2 model (classify_audio_json.py + voice_bot.py + huggingface_detector).
 * Requires Python and: pip install -r requirements.txt
 */
function classifyWithPython(audioPath: string): Promise<VoiceClassificationResult> {
  return new Promise((resolve, reject) => {
    const appPath = app.getAppPath()
    const scriptPath = path.join(appPath, SCRIPT_NAME)

    const proc = spawn(PYTHON_CMD, [scriptPath, audioPath], {
      cwd: appPath,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })

    proc.on('error', (err) => {
      reject(new Error(`Voice classifier failed to start: ${err.message}. Ensure Python and dependencies are installed (pip install -r requirements.txt).`))
    })

    proc.on('close', (code) => {
      try {
        const lines = stdout.trim().split(/\r?\n/)
        const jsonLine = lines.filter((l) => l.trim().startsWith('{')).pop() ?? stdout.trim()
        const parsed = JSON.parse(jsonLine) as VoiceClassificationResult & { error?: string }
        if (parsed.error != null) {
          reject(new Error(parsed.error))
          return
        }
        if (parsed.label !== 'human' && parsed.label !== 'ai') {
          reject(new Error(parsed.error ?? 'Invalid classifier response'))
          return
        }
        resolve({
          label: parsed.label,
          prob_human: Number(parsed.prob_human) ?? 0,
          prob_ai: Number(parsed.prob_ai) ?? 0,
          checkpoint_loaded: Boolean(parsed.checkpoint_loaded),
        })
      } catch {
        reject(new Error(stderr.trim() || stdout.trim() || `Classifier exited with code ${code}`))
      }
    })
  })
}

/**
 * Classify an audio file as human or AI-generated.
 * Uses AudioIntell.ai API when AUDIOINTELL_EMAIL and AUDIOINTELL_PASSWORD are set;
 * otherwise falls back to the local Python (Wav2Vec2) classifier.
 */
export function classifyAudioFile(audioPath: string): Promise<VoiceClassificationResult> {
  const useAudioIntell = process.env.AUDIOINTELL_EMAIL?.trim() && process.env.AUDIOINTELL_PASSWORD

  if (useAudioIntell) {
    const ext = path.extname(audioPath).toLowerCase()
    if (ext === '.mp3' || ext === '.wav') {
      return classifyWithAudioIntell(audioPath)
    }
    // For non-mp3/wav, fall through to Python
  }

  return classifyWithPython(audioPath)
}
