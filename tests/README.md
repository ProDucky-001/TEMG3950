# ScamShield Testing

## Prototype feature verification

### 1. Background screen recording & detection

| Capability | Status | Implementation |
|-----------|--------|----------------|
| **Detect application** | ✅ | `ActiveWindowMonitor` (active-win): process name, PID, path, bundleId. `AppContextDetector` maps to appId (chrome, safari, firefox, outlook, etc.). |
| **Detect screen contents** | ✅ | `ScreenCaptureManager` → Electron `desktopCapturer` → `preprocessForOCR` (sharp: grayscale, normalize, scale) → `OCRProcessor` (Tesseract.js, PSM 7/6, post-process corrections). Target >99% accuracy. |
| **Detect tab URL** | ✅ | `BrowserMonitor` + `PlatformSpecificManager.getCurrentBrowserUrl()`: AppleScript on macOS, PowerShell on Windows; active-win `url` fallback. |
| **Detect hover link** | ✅ | Extracted from OCR text via `EmailDetectionPipeline.processFromOCR` + `ContentExtractor.getFirstLinkForLog`. Browser URL is primary; OCR-parsed URLs are secondary. |

### 2. Grey / green overlay

| Requirement | Implementation |
|------------|----------------|
| **Grey on app window within 200ms** | When `appDetermined` (monitored browser or email client) and window bounds are available, grey corners are shown within `OVERLAY_APP_DETERMINED_DELAY_MS` (200ms). Overlay is placed on **application window bounds only**, never full desktop. |
| **Green on email tab within 450ms** | When email tab is confirmed (`isEmailTab`: URL matches Gmail/Outlook/etc. or OCR hints), `setOverlayVisible` is called **immediately** with state `monitoring` (green). The 200ms check interval means green typically appears in <200ms after detection. |
| **No overlay without window bounds** | If no frontmost window bounds are available (e.g. window is off primary display or unknown), overlay is hidden. No full-screen fallback. |

### 3. Debug log

**File**: `.cursor/debug-detection.log` (written every 2 seconds, skipped if identical to previous line)

**Format**:
```
[ISO timestamp] Application: <name> | Tab: <appId> | Email/Not Email | URL: <url> | Content: <first 100 chars> | Overlay: green/grey/none
```

**Example**:
```
[2026-03-08T12:00:00.000Z] Application: Google Chrome | Tab: chrome | Not Email | URL: https://example.com | Content: Example Domain This domain is for... | Overlay: grey
[2026-03-08T12:00:02.000Z] Application: Google Chrome | Tab: gmail | Email | URL: https://mail.google.com/mail/u/0/#inbox | Content: Inbox (3) - user@gmail.com Gmail ... | Overlay: green
```

### 4. No API calls for detection

All detection is **local-only**:
- OCR: Tesseract.js (in-process, no cloud)
- Content scanning: `ContentScanner` / `AIContentDetector` / `EmailDetector` — local pattern matching
- Link analysis: `LinkAnalyzer` — local heuristics + local `ScamDatabase`
- URL shortener expansion (`LinkScanner.expandIfShortener`): only follows HTTP redirects for known shorteners (bit.ly, etc.), no API key or cloud service

## Overview

- **Unit tests**: LinkAnalyzer, AIContentDetector, AlertManager, SettingsManager, ScamDatabase (Jest).
- **Integration tests**: Full detection flow (link/content scan → alert).
- **Suite tests**: Edge cases, invalid input, error recovery.
- **Performance tests**: Analysis speed benchmarks.

## Commands

```bash
npm run test              # All Jest tests (unit + integration + suite + performance)
npm run test:watch        # Watch mode
npm run test:coverage     # With coverage report
npm run test:perf         # Performance benchmarks only
npm run test:e2e         # Playwright E2E (browser; full Electron E2E needs playwright-electron)
```

## Test Data

- `tests/fixtures/link-fixtures.ts`: Phishing URLs, legitimate URLs, invalid URLs, typosquat samples.
- `tests/fixtures/content-fixtures.ts`: AI-generated text, human-like text, scam messages, short/empty content.

## E2E

**Current E2E tests** (run in a browser against the built renderer):

| Test | Description |
|------|-------------|
| Dashboard loads | Home page shows "ScamShield" title |
| Navigation to Settings | Settings link is visible |

**How to run:**

```bash
npm run build          # Build app first (produces out/renderer)
npx playwright install # One-time: download Chromium (note: "playwright" with a "w")
npm run test:e2e       # Starts a local static server (Node script) and runs Playwright
```

Playwright serves `out/renderer` on port 5173 and runs the tests. For full Electron E2E (app startup, tray, window management), integrate `playwright-electron` and launch the built app.

## User Feedback

- **False positive reporting**: `FeedbackManager.reportFalsePositive(alertId, kind, comment)`; IPC `FEEDBACK_REPORT_FALSE_POSITIVE`.
- **Anonymous usage stats (opt-in)**: `FeedbackManager.setUsageStatsOptIn(enabled)`; IPC `FEEDBACK_GET_OPT_IN` / `FEEDBACK_SET_OPT_IN`.

## Build & Package

```bash
npm run build
npx electron-builder     # Produces installers in release/
```

- **macOS**: DMG, ZIP (code signing: set `CSC_*` env when certs available).
- **Windows**: NSIS, portable.
- **Linux**: AppImage, deb.

Auto-update is configured with a generic provider URL; set `publish.url` or use GitHub releases when ready.
