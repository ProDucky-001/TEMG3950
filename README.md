# ScamShield

System tray application with background monitoring for scam and phishing detection. Built with **Electron**, **TypeScript**, and **React**.

---

## Quick start

```bash
npm install
npm run dev
```

- **Build:** `npm run build` (output in `out/`)
- **Package:** `npm run postinstall` then use electron-builder (e.g. `npx electron-builder`) for distributable (DMG/NSIS/AppImage)
- **Tests:** `npm test` (unit/integration), `npm run test:e2e` (Playwright)

---

## macOS development (permissions)

When running with `npm run dev`, macOS sees the **parent process** (Terminal or Cursor), not Electron. Grant permissions to that app.

### Screen Recording

ScamShield uses screen capture for email OCR. In dev, grant **Screen Recording** to the app that runs the dev server:

- **Terminal:** System Settings → Privacy & Security → Screen Recording → enable **Terminal** (or **iTerm2**, etc.).
- **Cursor:** Enable **Cursor** in the same list.

If the permission prompt doesn’t appear or capture still fails, reset the TCC database for that app (then grant again when prompted):

```bash
# For Terminal
tccutil reset ScreenCapture com.apple.Terminal

# For Cursor
tccutil reset ScreenCapture com.todesktop.cursor
```

### Accessibility

For active-window detection (e.g. which app is frontmost), grant **Accessibility** to the Electron binary used in dev:

1. System Settings → Privacy & Security → Accessibility.
2. Click **+**, then press **Cmd+Shift+G** and go to:  
   `[project folder]/node_modules/electron/dist`
3. Select **Electron.app** → Open, then turn the toggle **ON** for Electron.
4. Restart ScamShield.

If the app prompts you in-app, follow the dialog to open System Settings.

**Accessibility still returns null after adding the app?** 

- **Fully quit** ScamShield (tray → Quit), then start it again — the running process was started before you granted permission.
- **Remove and re-add:** In Accessibility, remove Electron (minus), then add it again via + and Cmd+Shift+G to `[project]/node_modules/electron/dist` → select Electron.app.
- **Apple Silicon:** If it still fails, add the **executable** inside the app: in the + dialog, Cmd+Shift+G and go to `[project]/node_modules/electron/dist/Electron.app/Contents/MacOS` and select **Electron** (the file, not the .app). Some macOS versions require this for child processes to get permission.

If you're running the **built** app (after `npx electron-builder`), add **ScamShield** (the built app appears in `release/mac/ScamShield.app` after packaging; there is no `release` folder until you run the packager).

### Running the built app

After `npm run build`, run the built app with:

```bash
npm run start
```

That uses the `out/` folder; there is no `release/` folder or ScamShield.app until you run the full packager, for example:

```bash
npx electron-builder --mac
```

Then the built app is at `release/mac/ScamShield.app` (and in the .dmg).

If the app closes immediately, a dialog should show the error. Run `npm run dev:verbose` for more detail when debugging.

### Debugging crashes

To see detailed Electron logs in the terminal:

```bash
npm run dev:verbose
```

---

## Architecture

### Process layout

| Layer | Path | Role |
|--------|------|------|
| **Main process** | `src/main/index.ts` | App lifecycle, tray, windows, IPC handlers |
| **Renderer process** | `src/renderer/` | React UI (dashboard, settings, alerts) |
| **Preload** | `src/preload/index.ts` | Secure bridge: exposes `window.scamshield` API to renderer |
| **Shared** | `src/shared/` | Types, IPC channel names, constants |

### Configuration

- **TypeScript:** `tsconfig.json` (renderer + shared), `tsconfig.node.json` (electron-vite config)
- **Bundler:** `electron-vite.config.ts` (electron-vite: main, preload, renderer with Vite + React)
- **Packaging:** `package.json` `build` section + `electron-builder.json` (appId, targets, icons)

**Electron window lifecycle:** Browser windows are held in long-lived managers (e.g. `WindowManager.dashboardWindow`, `ScreenCaptureManager.captureWindow`), which are themselves referenced from the main process. Do not create a `BrowserWindow` only inside a function and then drop the reference — the window would be garbage-collected and close. Assign to a module-level or instance-level variable and set it to `null` in the window’s `closed` handler (as in `WindowManager`).

---

## Project structure

```
├── index.html                 # Entry HTML for renderer
├── package.json               # Scripts, deps, electron-builder config
├── electron.vite.config.ts    # Main / preload / renderer builds
├── tsconfig.json              # TypeScript (src + index.html)
├── tsconfig.node.json         # Node/electron-vite config
├── electron-builder.json      # Packaging options (optional override)
├── src/
│   ├── main/
│   │   ├── index.ts           # Main entry: init(), IPC, lifecycle
│   │   ├── storeLoader.ts     # Dynamic electron-store load (ESM)
│   │   ├── managers/          # Modular managers
│   │   │   ├── TrayManager.ts       # System tray, context menu, status icon
│   │   │   ├── WindowManager.ts     # Dashboard/settings windows, state
│   │   │   ├── SettingsManager.ts   # User preferences (electron-store)
│   │   │   ├── AlertManager.ts      # Alerts, history, export
│   │   │   ├── MonitoringManager.ts # Background scanning coordination
│   │   │   ├── BackgroundServiceManager.ts  # Tray-only mode, before-quit
│   │   │   └── ...
│   │   ├── services/          # Link scanner, scam DB, content/AI detection
│   │   └── integration/       # AppMonitorManager, clipboard/browser polling
│   ├── preload/
│   │   └── index.ts           # contextBridge API for renderer
│   ├── renderer/
│   │   ├── main.tsx           # React entry
│   │   ├── App.tsx            # Router, routes, InAppAlertOverlay
│   │   ├── components/        # MainDashboard, InAppAlertOverlay, etc.
│   │   ├── pages/             # Settings, AlertDetail, Statistics, Onboarding
│   │   └── styles/
│   └── shared/
│       ├── types.ts           # Settings, Alert, Statistics, ThreatStatus
│       ├── ipc-channels.ts    # IPC channel constants
│       ├── alert-types.ts
│       ├── link-detection-types.ts
│       └── ...
├── assets/
│   └── icons/                 # tray-safe.png, tray-warning.png, tray-threat.png, icon.icns, icon.ico
└── tests/
```

---

## Implemented features (requirements checklist)

1. **Electron + TypeScript + React**  
   - Main, renderer, preload; shared types and IPC.

2. **System tray**
   - Tray icon (shield; green/yellow/red by status).
   - Context menu: **Open Dashboard**, **Toggle Monitoring** (Pause/Resume), **Settings**, **Quit**.
   - Status: safe / warning / threat (tooltip + icon).

3. **Settings window**
   - Toggle monitoring on/off.
   - Configure which apps to monitor (Gmail, WhatsApp, Messages, etc.) via `monitoredApps`.
   - Alert preferences: sound, notification type (banner/alert/silent), desktop notifications, quiet hours, focus mode.
   - Sensitivity level (low / medium / high).
   - Launch at startup, minimize to tray, close to tray, dashboard always on top.

4. **Dashboard**
   - Recent alerts history (filter, sort, export JSON/CSV).
   - Statistics: links scanned, threats detected, last scan.
   - Check URL (manual scan).
   - Protected-apps style status is reflected by global monitoring state (no separate “protected apps” card in UI).

5. **Persistence**
   - **electron-store** for settings, window state, scam DB, alert history.

6. **App lifecycle**
   - Minimize to tray / close to tray options.
   - Quit from tray or IPC: cleanup (stop monitoring, destroy tray, close windows) then exit.

7. **Launch at startup**
   - **StartupManager** + settings sync; uses Electron `setLoginItemSettings` on macOS/Windows.

8. **Managers**
   - **TrayManager** – tray icon, menu, status.
   - **SettingsManager** – preferences (electron-store).
   - **AlertManager** – notifications, history, export.
   - **MonitoringManager** – scanning coordination, stats.
   - **WindowManager** – dashboard/settings windows, state.

See **FUNCTIONALITY_OVERVIEW.md** for detailed status of link detection, alerts, monitoring, and tests.

---

## Assets

Place tray icons in `assets/icons/`:

- `tray-safe.png`, `tray-warning.png`, `tray-threat.png` (e.g. 16×16 or 32×32)
- `icon.icns` (macOS), `icon.ico` (Windows) for the built app

If tray PNGs are missing, the app uses a generated placeholder icon.

---

## Python / voice model

This repository also contains Python code and models for AI vs human voice classification (e.g. `train_voice_classifier.py`, `predict_voice.py`, `model/`). That is separate from the Electron app; run with `pip install -r requirements.txt` and the commands described in the docstrings or existing Python docs.

---

## Python / Voice Bot (Human vs AI Voice)

## Installation

```
pip install -r requirements.txt  
```

## Usage

Described in example.py
```
python example.py
```

### Voice Bot: Human vs AI Voice (Scam Copilot)

**Integrated bot** that distinguishes **any MP3** (or WAV/FLAC/OGG/M4A) as human or AI-generated voice.

**Use in your app:**
```python
from voice_bot import VoiceBot

bot = VoiceBot()  # optional: checkpoint_path=..., config_path=...
result = bot.classify("call_recording.mp3")
# result["label"]     -> "human" | "ai"
# result["prob_human"] -> 0.92
# result["prob_ai"]    -> 0.08

if bot.is_ai("suspicious.mp3"):
    print("Possible synthetic voice")
```

**CLI** (any audio format, including any form of MP3):
```bash
python predict_voice.py path/to/audio.mp3
python predict_voice.py --audio recording.mp3 --checkpoint checkpoints/voice_classifier.pt

# Or run the bot module directly
python -m voice_bot recording.mp3
```

**1. Train** on labeled data (human and AI voice samples):
```bash
python train_voice_classifier.py --human_dir path/to/human_audio --ai_dir path/to/ai_audio --epochs 20
python train_voice_classifier.py --data_csv path/to/labels.csv --epochs 20
```

**2. Predict** on new audio (MP3, WAV, FLAC, OGG, M4A supported; ffmpeg on PATH enables all MP3 variants if torchaudio fails).
 
## Code Style
I follow [PEP-8](https://www.python.org/dev/peps/pep-0008/) for code style. Especially the style of docstrings is important to generate documentation.  
  
## Reference
- [wav2vec 2.0: A Framework for Self-Supervised Learning of Speech Representations](https://arxiv.org/abs/2006.11477)
  
## Author
  
* [Harunori Kawano](https://harunorikawano.github.io/)
