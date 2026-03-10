# Green vs Grey Overlay

## How the state is determined

The corner overlay has two visual states:

| State        | Color (CSS) | Meaning |
|-------------|-------------|--------|
| **monitoring** | Green `#22c55e` | Email tab/client is active; we're protecting this view. |
| **processing** | Grey `#808080`  | Not on email, or (previously) capture in progress. |

### Where it’s decided

**ScreenCaptureManager** (`updateOverlayVisibility`) decides the state and sends it to the overlay window.

1. **Inputs**
   - **Window context** from `getContextAndBounds()` (DetectionManager or AppleScript): `context.browserUrl`, `context.isEmailClientActive`, `context.windowName`, `context.appId`.
   - **Extension tab state** (if recent): `lastExtensionTabState.isEmail` from the extension.
   - **Capture flag**: `captureInProgress` (true from capture request until `handleCaptureResult` runs).
   - **Persisted email state**: `currentEmailState` (sticky “we’re on email” until a full non-email URL is seen).

2. **“Is this an email tab?”** (`isEmailTab`)
   - **Browser (Chrome/Safari/etc.):**
     - If **extension** says email and state is recent → use `lastExtensionTabState.isEmail`.
     - Else if **URL** is an email domain (Gmail, Outlook, etc.) → `true`.
     - Else if **full non-email URL** (real URL, not email) → `false`.
     - Else (no URL / stale / empty) → **persist**: `isEmailTab = currentEmailState` (stay green until we see a non-email URL).
   - **Non-browser:** `isEmailTab = context.isEmailClientActive`.

3. **State sent to overlay**
   - Previously:
     - `state = captureInProgress ? 'processing' : (stableEmailState ? 'monitoring' : 'processing')`
     - So: **green** only when not capturing and email; **grey** when capturing or not email.
   - After fix:
     - When we’re on an email tab we always show **green** (monitoring), even while a capture is in progress, to avoid flicker. Grey is only used when we’re not on an email tab.

### Debouncing

- **updateOverlayState()** debounces the state sent to the renderer: a new state is only applied after it has been requested for **OVERLAY_STATE_DEBOUNCE_MS** (200 ms). If a different state is requested before that, the timer resets. This reduces rapid green↔grey flips from multiple quick updates.

## Why it was flickering when logs said “email”

- **poll()** runs on a timer (e.g. every few seconds when on email).
- Each poll that decides “email” does:
  1. `captureInProgress = true`
  2. `updateOverlayVisibility()` → state = **processing** (grey) because capture was in progress
  3. Send `capture-request` to the capture window
  4. Later **handleCaptureResult** runs → `captureInProgress = false` → `updateOverlayVisibility()` → state = **monitoring** (green)

So every poll cycle the overlay went: **green → grey** (when capture started) then **grey → green** (when capture finished). Debug logs correctly showed “email” the whole time; the flicker came from **tying the overlay state to `captureInProgress`** so that “capturing” forced grey.

## Fix

- **Rule:** On an email tab, always show **green** (monitoring). Do not switch to grey just because a capture is in progress.
- **Implementation:** In `updateOverlayVisibility`, set overlay state to:
  - **monitoring** (green) when `stableEmailState` is true, regardless of `captureInProgress`.
  - **processing** (grey) only when we’re not on an email tab (e.g. non-email URL or extension says not email).

So:
- `state = stableEmailState ? 'monitoring' : 'processing'`

No use of `captureInProgress` for the overlay color when on email. This removes the per-poll green→grey→green flicker while keeping grey for non-email contexts.
