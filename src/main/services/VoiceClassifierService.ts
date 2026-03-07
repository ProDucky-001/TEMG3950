import { spawn } from 'child_process'
import path from 'path'
import { app } from 'electron'
import type { VoiceClassificationResult } from '../../shared/voice-types'

export type { VoiceClassificationResult }

const PYTHON_CMD = process.env.PYTHON_PATH ?? 'python'
const SCRIPT_NAME = 'classify_audio_json.py'

/**
 * Run the Python voice classifier on an audio file.
 * Uses SONAR model (classify_audio_json.py + voice_bot.py). Requires Python and: pip install -r requirements.txt
 */
export function classifyAudioFile(audioPath: string): Promise<VoiceClassificationResult> {
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
        // SONAR may print warnings to stdout before our JSON; extract last JSON line
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
