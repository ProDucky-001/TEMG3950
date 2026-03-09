# ScamShield – Functionality Overview

This document lists current features and marks each as **Implemented** (working end-to-end) or **Placeholder** (stub / UI-only / not fully wired).

---

## 1. Link / URL detection

| Feature | Status | Notes |
|--------|--------|--------|
| **Manual “Check URL” in dashboard** | ✅ Implemented | Input + “Scan link” calls `scanLink` IPC; shows risk score, explanation, recommendations, reliability note. |
| **Risk score (0–100)** | ✅ Implemented | Rule-based: known malicious domains, suspicious TLDs (.tk, .xyz, etc.), shorteners, IP in URL, login/credential params, financial/urgency/prize keywords, typosquatting, brand impersonation. Weights tuned for sensitivity. |
| **Trusted-domain allowlist** | ✅ Implemented | Reduces score for known-good domains (google.com, github.com, etc.) unless domain is in threat DB. |
| **URL shortener expansion** | ✅ Implemented | Follows redirects for bit.ly, tinyurl.com, etc. via Electron `net`; analyzes final URL. |
| **ScamDatabase (threat DB)** | ✅ Implemented | Persisted with electron-store: malicious domains, phishing keywords, scam phrases, suspicious TLDs, recent detections. Add/reset/update supported. |

---

## 2. Alerts and popups

| Feature | Status | Notes |
|--------|--------|--------|
| **In-app threat popup (modal)** | ✅ Implemented | When a threat is detected, dashboard is opened/focused and a modal shows: “Suspicious content detected”, severity, message, link, score, actions (Ignore, Get Details, Learn More). Critical/High do not auto-dismiss. |
| **OS (native) notifications** | ✅ Implemented | Electron `Notification` for every severity; immediate delivery (no batching). Optional sound; macOS actions: Get Details, Open Settings. |
| **Alert history (last 30 days)** | ✅ Implemented | Stored in electron-store; exposed via IPC. Dashboard and Statistics use it. |
| **Alert export (JSON / CSV)** | ✅ Implemented | From dashboard “Recent alerts” and AlertHistoryManager. |
| **Quiet hours / Focus mode** | ✅ Implemented | Settings; AlertPresenter suppresses non-critical when enabled. |
| **Grouping (duplicate suppression)** | ✅ Implemented | Same severity+type in a 1‑minute window is suppressed to avoid spam. |

---

## 3. Background monitoring

| Feature | Status | Notes |
|--------|--------|--------|
| **Clipboard monitoring** | ✅ Implemented | Poll every 2s; when clipboard text changes and contains URLs/snippet, ContentExtractor + ApplicationIntegrator run link + content analysis. If risk ≥ 50, alert is added and popup/notification shown. |
| **Browser URL monitoring** | ✅ Implemented (macOS) | When frontmost app is Chrome, Safari, Firefox, or Edge, poll every 5s via AppleScript for current tab URL. Scan on change; if risk ≥ 50, alert + popup. **Windows:** not implemented (returns null). |
| **Active app detection** | ✅ Implemented | macOS: AppleScript; Windows: PowerShell; Linux: xdotool. Used for context (email vs messaging vs browser) and to enable/disable browser URL polling. |
| **Power (suspend/resume)** | ✅ Implemented | Monitoring pauses on suspend, resumes on resume. |
| **Screen capture + OCR (email clients)** | ✅ Implemented | When Gmail, Outlook, or Apple Mail is in focus: hidden window uses desktopCapturer + getUserMedia to capture active window; Tesseract.js (local OCR) extracts text; 2s cache; max 1280×720; analysis same as clipboard. Permission handling (macOS Screen Recording); graceful fallback to clipboard-only if denied. |
| **Email / Outlook in-app reading** | ✅ Implemented (via screen OCR) | Screen capture + OCR when email client is active; no direct access to compose/inbox. Clipboard still used when user copies. |
| **Messaging app in-app reading** | ❌ Placeholder | Same as email: only clipboard. No reading of WhatsApp/Telegram/Discord message content. |

---

## 4. AI / content detection

| Feature | Status | Notes |
|--------|--------|--------|
| **ContentScanner** | ✅ Implemented | Single entry; dispatches by source (generic, email, whatsapp, telegram, discord, document, social). |
| **AIContentDetector (generic)** | ✅ Implemented | Heuristics: entropy, sentence length variation, repetition, “too perfect” grammar, urgency/emotional language. Returns `AIDetectionResult` (isAIgenerated, confidence, indicators, scamIndicators). |
| **Source-specific detectors** | ⚠️ Partially implemented | EmailDetector, MessageAppDetector, SocialMediaDetector, DocumentDetector exist and extend BaseSourceDetector; they add context (e.g. forward chains, headers) but still use the same heuristic core—no external AI/ML API. |
| **TextAnalysisEngine** | ✅ Implemented | Used by detectors: token distribution, vocabulary, sentence length, style consistency. |

---

## 5. System integration and lifecycle

| Feature | Status | Notes |
|--------|--------|--------|
| **System tray** | ✅ Implemented | TrayManager: icon, status (safe/warning/threat), context menu (Dashboard, Settings, Enable/Disable Protection, Quit). Double-click opens dashboard. |
| **Launch at startup** | ✅ Implemented | StartupManager uses Electron `setLoginItemSettings` (macOS/Windows); synced with settings. |
| **Window state (position/size)** | ✅ Implemented | WindowStateStore (electron-store); restore on open; always-on-top option. |
| **Update checker** | ✅ Implemented | electron-updater; notify-only (no auto-install). |
| **System events (sleep/wake, lock)** | ✅ Implemented | SystemEventListeners + powerMonitor; used to pause monitoring on suspend. |
| **Resource / battery optimization** | ❌ Placeholder | ResourceManager exists but does not implement CPU/battery-aware throttling or worker threads. |

---

## 6. Dashboard and settings UI

| Feature | Status | Notes |
|--------|--------|--------|
| **Main dashboard** | ✅ Implemented | Protection toggle, threats blocked (today/week/month), last scan, Check URL section, quick actions, alerts by severity chart, recent alerts (filter/sort), export. |
| **Settings (tabs)** | ✅ Implemented | General, Monitoring, Alerts, Privacy, About. Persisted via SettingsManager (electron-store). |
| **Alert detail page** | ✅ Implemented | Full alert view; user feedback (Report false positive, Help improve). |
| **Statistics view** | ✅ Implemented | Charts and export (e.g. CSV). |
| **Onboarding flow** | ✅ Implemented | Welcome, permissions, app selection, etc. |
| **Threat details popup** | ✅ Implemented | Risk score, explanation, recommendation, “About this score” reliability text. |
| **Protected apps list** | ❌ Removed | Was in dashboard; removed because per-app protection is not fully implemented (only global monitoring + clipboard + browser URL). |

---

## 7. Privacy and permissions

| Feature | Status | Notes |
|--------|--------|--------|
| **PrivacyManager** | ✅ Implemented | No storage of message content; requireNoStorage; per-app monitoring allow/deny; privacy summary for UI. |
| **ContentExtractor** | ✅ Implemented | Extracts URLs and snippet from text; no persistent storage of content. |
| **Accessibility permission** | ✅ Implemented | macOS: check + open System Settings; used for active app (and browser URL via AppleScript). |

---

## 8. Testing and build

| Feature | Status | Notes |
|--------|--------|--------|
| **Unit tests (Jest)** | ✅ Implemented | SettingsManager, AlertManager, ScamDatabase, LinkAnalyzer, AIContentDetector, etc. Mocks for electron-store and electron. |
| **Integration tests** | ✅ Implemented | Detection flow: link scan, content scan, alert add/history/stats/export. |
| **E2E (Playwright)** | ✅ Implemented | Dashboard load, title, Settings link; runs against static renderer (webServer). |
| **Performance tests** | ✅ Implemented | LinkAnalyzer and AIContentDetector speed benchmarks. |
| **Production build** | ✅ Implemented | electron-vite build; electron-builder for DMG/NSIS/AppImage. |

---

## Summary

- **Implemented:** Link detection (manual + clipboard + browser URL on macOS), alerts (in-app modal + OS notifications), dashboard and settings, tray, startup, persistence, AI/content heuristics, privacy controls, tests, build.
- **Placeholder / partial:** Email and messaging in-app reading (clipboard only), Windows browser URL monitoring, resource/battery optimization; per-app “protected apps” UI removed.
- **Detection sensitivity:** Weights and scoring are tuned so phishing-style URLs (suspicious TLDs, login params, financial/urgency keywords, typosquatting, etc.) produce higher scores; allowlist only slightly reduces scores for trusted domains (0.85×); no caps on single-signal scores.
