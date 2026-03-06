# ScamShield Testing

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
