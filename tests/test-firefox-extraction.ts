/**
 * Manual test for Firefox URL extraction on macOS.
 * Run with: npx ts-node tests/test-firefox-extraction.ts
 *
 * Prerequisites: Firefox in front with a tab open. Terminal (or runner) needs
 * Accessibility permission for System Events to read the address bar.
 */

const { exec } = require('child_process')
const { promisify } = require('util')
const execAsync = promisify(exec)

async function runScript(script: string, label: string): Promise<string | null> {
  const scriptWithoutRedirect = script.replace(/\s*2>\/dev\/null\s*$/, '')
  try {
    const { stdout, stderr } = await execAsync(scriptWithoutRedirect, { timeout: 3000 })
    const u = (stdout ?? '').trim()
    if (stderr && stderr.trim()) console.log(`  ${label} stderr: ${stderr.trim().slice(0, 200)}`)
    if (u && u.length > 4) return u
    console.log(`  ${label}: (empty or short)`)
    return null
  } catch (e: unknown) {
    const err = e as { message?: string; stderr?: string; stdout?: string }
    const full = [err.message, err.stderr, err.stdout].filter(Boolean).join(' | ')
    console.log(`  ${label}: FULL ERROR: ${full}`)
    return null
  }
}

async function main() {
  console.log('=== Firefox URL extraction test ===\n')
  console.log('Make sure Firefox is the frontmost app with a tab open.\n')

  const scripts: Array<[string, string]> = [
    [
      'osascript -e \'tell application "System Events" to tell process "Firefox" to get value of combo box 1 of toolbar "Navigation" of front window\' 2>/dev/null',
      'Combo box of toolbar Navigation of front window',
    ],
    [
      'osascript -e \'tell application "System Events" to tell process "Firefox" to get value of UI element 1 of combo box 1 of toolbar "Navigation" of first group of front window\' 2>/dev/null',
      'UI element 1 of combo box, first group',
    ],
    [
      'osascript -e \'tell application "System Events" to tell process "Firefox" to get value of first text field of toolbar 1 whose description is "Address and Search Bar"\' 2>/dev/null',
      'Address and Search Bar (text field)',
    ],
    [
      'osascript -e \'tell application "System Events" to tell process "Firefox" to get value of combo box 1 of group 1 of toolbar "Navigation" of group 1 of front window\' 2>/dev/null',
      'Combo box Navigation',
    ],
    [
      'osascript -e \'tell application "System Events" to get value of combo box 1 of group 1 of toolbar "Navigation" of group 1 of front window of application process "Firefox"\' 2>/dev/null',
      'Combo box (front window)',
    ],
  ]

  for (const [script, label] of scripts) {
    const url = await runScript(script, label)
    if (url) {
      console.log(`  ${label}: ${url.slice(0, 80)}${url.length > 80 ? '...' : ''}`)
      console.log('\nFirefox URL extraction succeeded.')
      process.exit(0)
    }
  }

  console.log('\nAll methods returned no URL. Check:')
  console.log('  1. Firefox is the frontmost application.')
  console.log('  2. Terminal (or the process running this script) has Accessibility permission.')
  console.log('  3. In Firefox about:config, accessibility.force_disabled = -1 (optional).')
  process.exit(1)
}

main()
