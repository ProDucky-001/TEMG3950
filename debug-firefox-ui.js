#!/usr/bin/env node
/**
 * Debug script: dump Firefox's accessibility (UI) tree on macOS.
 * Run with: node debug-firefox-ui.js
 * Prerequisites: Firefox must be open (and ideally frontmost).
 * Requires: Accessibility permission for the terminal (or the app running this script).
 *
 * Outputs role, title, description, value, children count for every element (max depth 8).
 * Writes full output to .cursor/firefox-ui-dump.txt and prints a preview + any URL-like elements.
 *
 * IMPORTANT: Run with Firefox's main window focused (click the window with the URL bar first).
 * If you see "window count: 0" or "Invalid index", focus the Firefox window and run again.
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const MAX_DEPTH = 8
const OUTPUT_FILE = path.join(__dirname, '.cursor', 'firefox-ui-dump.txt')

/** Run AppleScript: (1) flat list via log, (2) targeted URL-bar probes. */
function runAppleScriptDump() {
  const scriptDir = path.join(__dirname, '.cursor')
  if (!fs.existsSync(scriptDir)) fs.mkdirSync(scriptDir, { recursive: true })

  // Part 1: flat dump of entire contents (same as before, worked)
  const flatScript = [
    'tell application "System Events" to tell process "Firefox"',
    '  try',
    '    set allEls to entire contents of window 1',
    '    set i to 0',
    '    repeat with el in allEls',
    '      set i to i + 1',
    '      set r to "?"',
    '      set t to ""',
    '      set d to ""',
    '      set v to ""',
    '      try',
    '        set r to value of attribute "AXRole" of el as text',
    '      end try',
    '      try',
    '        set t to value of attribute "AXTitle" of el',
    '        if t is missing value then set t to ""',
    '      on error',
    '        set t to ""',
    '      end try',
    '      try',
    '        set d to value of attribute "AXDescription" of el',
    '        if d is missing value then set d to ""',
    '      on error',
    '        set d to ""',
    '      end try',
    '      try',
    '        set v to value of attribute "AXValue" of el',
    '        if v is missing value then set v to ""',
    '        if length of v > 90 then set v to (text 1 thru 90 of v) & "..."',
    '      on error',
    '        set v to ""',
    '      end try',
    '      try',
    '        log ("ELEM:" & i & " | AXRole:" & r & " | AXTitle:" & (t as text) & " | AXDescription:" & (d as text) & " | AXValue:" & (v as text))',
    '      on error errMsg',
    '        log ("ELEM:" & i & " | error:" & errMsg)',
    '      end try',
    '      if r is "AXGroup" then',
    '        try',
    '          set subEls to entire contents of el',
    '          set j to 0',
    '          repeat with sub in subEls',
    '            set j to j + 1',
    '            set r2 to "?"',
    '            set t2 to ""',
    '            set d2 to ""',
    '            set v2 to ""',
    '            try',
    '              set r2 to value of attribute "AXRole" of sub as text',
    '            end try',
    '            try',
    '              set t2 to value of attribute "AXTitle" of sub',
    '              if t2 is missing value then set t2 to ""',
    '            on error',
    '              set t2 to ""',
    '            end try',
    '            try',
    '              set v2 to value of attribute "AXValue" of sub',
    '              if v2 is missing value then set v2 to ""',
    '              if length of v2 > 90 then set v2 to (text 1 thru 90 of v2) & "..."',
    '            on error',
    '              set v2 to ""',
    '            end try',
    '            log ("  SUB:" & i & "." & j & " | AXRole:" & r2 & " | AXTitle:" & (t2 as text) & " | AXValue:" & (v2 as text))',
    '          end repeat',
    '        on error errMsg2',
    '          log ("  SUB:" & i & " | error:" & errMsg2)',
    '        end try',
    '      end if',
    '    end repeat',
    '  on error errMsg',
    '    log ("ERROR: " & errMsg)',
    '  end try',
    'end tell',
  ].join('\n')

  // Part 2: targeted probes for URL (run separate scripts to avoid building UI refs in one block)
  const probes = [
    { name: 'window count', script: 'tell application "System Events" to tell process "Firefox" to get count of windows' },
    { name: 'every window name (first 3)', script: 'tell application "System Events" to tell process "Firefox" to get name of window 1' },
    { name: 'toolbars of window 1', script: 'tell application "System Events" to tell process "Firefox" to get name of every toolbar of window 1' },
    { name: 'combo boxes of window 1', script: 'tell application "System Events" to tell process "Firefox" to get count of combo boxes of window 1' },
    { name: 'text fields of window 1', script: 'tell application "System Events" to tell process "Firefox" to get count of text fields of window 1' },
    { name: 'toolbar 1 combo box 1 value', script: 'tell application "System Events" to tell process "Firefox" to get value of attribute "AXValue" of combo box 1 of toolbar 1 of window 1' },
    { name: 'toolbar "Navigation" combo box 1 value', script: 'tell application "System Events" to tell process "Firefox" to get value of attribute "AXValue" of combo box 1 of toolbar "Navigation" of window 1' },
    { name: 'text field 1 of combo box 1 of toolbar 1 value', script: 'tell application "System Events" to tell process "Firefox" to get value of attribute "AXValue" of text field 1 of combo box 1 of toolbar 1 of window 1' },
  ]

  const scriptPath = path.join(scriptDir, 'firefox-dump.applescript')
  fs.writeFileSync(scriptPath, flatScript, 'utf8')
  const parts = []
  let result = ''
  try {
    result = execSync(`osascript "${scriptPath}" 2>&1`, {
      encoding: 'utf8',
      timeout: 60000,
      maxBuffer: 8 * 1024 * 1024,
    })
  } catch (e) {
    result = (e.stdout || '') + (e.stderr || '') + (e.message || '')
  }
  {
    const lines = (result || '')
      .split('\n')
      .filter((line) => line.includes('ELEM:') || line.includes('SUB:'))
      .map((line) => {
        const m = line.match(/ELEM:(\d+)\s*\|\s*(.*)/)
        if (m) return '--- Element ' + m[1] + ' --- | ' + m[2].replace(/^["\s]+|["\s]+$/g, '')
        const m2 = line.match(/SUB:([\d.]+)\s*\|\s*(.*)/)
        if (m2) return '  --- Sub ' + m2[1] + ' --- | ' + m2[2].replace(/^["\s]+|["\s]+$/g, '')
        return line.replace(/^["\s]+|["\s]+$/g, '')
      })
    parts.push(lines.join('\n').trim() || (result || '').trim())
  }

  parts.push('')
  parts.push('=== Targeted URL bar probes ===')
  for (const p of probes) {
    try {
      const out = execSync(`osascript -e ${JSON.stringify(p.script)}`, { encoding: 'utf8', timeout: 3000 })
      const v = (out || '').trim()
      parts.push(p.name + ': ' + (v.length > 80 ? v.slice(0, 80) + '...' : v))
    } catch (e) {
      parts.push(p.name + ': ERROR ' + (e.message || '').split('\n')[0])
    }
  }
  return parts.join('\n')
}

// JXA script as a string we can pass to osascript -l JavaScript -e '...'
// We build it so recursion limit and output are correct.
function buildScript() {
  return `
function run() {
  var se = Application("System Events");
  var procs = se.processes.whose({ name: "Firefox" });
  if (procs.length === 0) return "ERROR: Firefox process not found. Is Firefox running?";
  var proc = procs[0];
  var wins = proc.windows();
  if (!wins || wins.length === 0) return "ERROR: No window found for Firefox.";
  var win = wins[0];
  var lines = [];
  lines.push("=== Firefox UI tree (max depth ${MAX_DEPTH}) ===");
  lines.push("");

  function tryGet(obj, prop) {
    try {
      var v = obj[prop];
      if (v === undefined || v === null) return "";
      if (typeof v === "function") return "";
      return String(v);
    } catch (e) {
      return "";
    }
  }

  function describe(el, depth) {
    if (depth > ${MAX_DEPTH}) return;
    var indent = "  ".repeat(depth);
    var role = "";
    var title = "";
    var desc = "";
    var value = "";
    try { role = tryGet(el, "role") || ""; } catch (e) {}
    try { title = tryGet(el, "title") || ""; } catch (e) {}
    try { desc = tryGet(el, "description") || ""; } catch (e) {}
    try { value = tryGet(el, "value") || ""; } catch (e) {}
    var childCount = 0;
    try {
      if (el.groups) childCount += (el.groups() || []).length;
      if (el.textFields) childCount += (el.textFields() || []).length;
      if (el.comboBoxes) childCount += (el.comboBoxes() || []).length;
      if (el.toolbars) childCount += (el.toolbars() || []).length;
      if (el.buttons) childCount += (el.buttons() || []).length;
      if (el.staticTexts) childCount += (el.staticTexts() || []).length;
      if (el.scrollAreas) childCount += (el.scrollAreas() || []).length;
      if (el.splitterGroups) childCount += (el.splitterGroups() || []).length;
      if (el.tabGroups) childCount += (el.tabGroups() || []).length;
      if (el.menuBars) childCount += (el.menuBars() || []).length;
      if (el.rows) childCount += (el.rows() || []).length;
      if (el.columns) childCount += (el.columns() || []).length;
      if (el.images) childCount += (el.images() || []).length;
    } catch (e) {}
    var valuePreview = value.length > 70 ? value.substring(0, 70) + "..." : value;
    var line = indent + "role=" + role + " | title=" + title + " | description=" + desc + " | value=" + valuePreview + " | children=" + childCount;
    lines.push(line);
    if (value && value.length > 4 && (value.indexOf("http") === 0 || value.indexOf(".") > 0)) {
      lines.push(indent + "  >>> POSSIBLE URL BAR <<<");
    }
    try { if (el.groups) { var g = el.groups(); for (var i = 0; i < g.length; i++) describe(g[i], depth + 1); } } catch (e) {}
    try { if (el.textFields) { var t = el.textFields(); for (var j = 0; j < t.length; j++) describe(t[j], depth + 1); } } catch (e) {}
    try { if (el.comboBoxes) { var c = el.comboBoxes(); for (var k = 0; k < c.length; k++) describe(c[k], depth + 1); } } catch (e) {}
    try { if (el.toolbars) { var tb = el.toolbars(); for (var t = 0; t < tb.length; t++) describe(tb[t], depth + 1); } } catch (e) {}
    try { if (el.buttons) { var b = el.buttons(); for (var u = 0; u < b.length; u++) describe(b[u], depth + 1); } } catch (e) {}
    try { if (el.scrollAreas) { var s = el.scrollAreas(); for (var v = 0; v < s.length; v++) describe(s[v], depth + 1); } } catch (e) {}
    try { if (el.splitterGroups) { var sg = el.splitterGroups(); for (var w = 0; w < sg.length; w++) describe(sg[w], depth + 1); } } catch (e) {}
    try { if (el.tabGroups) { var tg = el.tabGroups(); for (var x = 0; x < tg.length; x++) describe(tg[x], depth + 1); } } catch (e) {}
  }
  describe(win, 0);
  var nl = "\\n";
  lines.push("");
  lines.push("=== End ===");
  return lines.join(nl);
}
run();
`
}

function main() {
  console.log('Dumping Firefox UI tree...')
  console.log('Ensure Firefox is open and this process has Accessibility permission.\n')
  const parts = []
  parts.push('========== FLAT DUMP (AppleScript: entire contents + AX attributes) ==========')
  parts.push('')
  try {
    parts.push(runAppleScriptDump())
  } catch (err) {
    parts.push('AppleScript dump failed: ' + err.message)
  }
  parts.push('')
  parts.push('========== HIERARCHICAL TREE (JXA, max depth ' + MAX_DEPTH + ') ==========')
  parts.push('')
  const scriptPath = path.join(__dirname, '.cursor', 'firefox-ui-dump.jxa.js')
  const scriptDir = path.dirname(scriptPath)
  if (!fs.existsSync(scriptDir)) fs.mkdirSync(scriptDir, { recursive: true })
  fs.writeFileSync(scriptPath, buildScript(), 'utf8')
  let out
  try {
    out = execSync(`osascript -l JavaScript "${scriptPath}"`, {
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 4 * 1024 * 1024,
    })
    parts.push((out || '').trim())
  } catch (err) {
    if (err.stderr) process.stderr.write(err.stderr)
    parts.push('JXA dump failed: ' + err.message)
  }
  const text = parts.join('\n')
  fs.writeFileSync(OUTPUT_FILE, text, 'utf8')
  console.log('Full output written to:', OUTPUT_FILE)
  console.log('\n--- Preview: flat dump (first 80 lines) ---\n')
  const lines = text.split('\n')
  lines.slice(0, 80).forEach((line) => console.log(line))
  if (lines.length > 80) {
    console.log('\n... (' + (lines.length - 80) + ' more lines in file)')
  }
  const urlLike = lines.filter((l) => l.includes('AXValue: http') || l.includes('POSSIBLE URL BAR'))
  if (urlLike.length > 0) {
    console.log('\n--- Lines that might be the URL bar (AXValue like URL) ---')
    urlLike.forEach((l) => console.log(l))
  }
}

main()
