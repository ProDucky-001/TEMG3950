# Research: Tracking the Active Application Window for Grey Overlay Positioning

This document summarizes methods to track **which application window is in the foreground** so the grey/green overlay can be drawn **around the corners of that specific window** (instead of full-screen).

---

## What “App Script” Means Here

- **Google Apps Script** runs inside Google Workspace (Sheets, Gmail, Docs). It **cannot** see or track desktop windows or other applications. It is not suitable for “which app is open” or overlay positioning on the user’s machine.
- **Script-based methods** that *are* relevant are **desktop automation scripts** run by your Electron app:
  - **macOS:** AppleScript (e.g. via `osascript`)
  - **Windows:** PowerShell, VBScript, or Win32 API calls (e.g. from Node via `ffi` or a helper process)

Your app **already uses** these script/API approaches for window tracking; below is how they fit together and what alternatives exist.

---

## How the App Currently Tracks the Frontmost Window

### 1. **OverlayManager + PlatformSpecificManager (primary source of bounds)**

- **OverlayManager** (`src/main/windows/OverlayManager.ts`) gets “frontmost window bounds” via **PlatformSpecificManager.getFrontmostWindowBounds()**.
- **macOS:** Implemented in **AppleScript**:
  - **Preferred:** `System Events` → frontmost process → `window 1` → **`AXFrame`** (gives x, y, width, height). Cocoa uses bottom-left origin; the code converts to top-left using primary display height.
  - **Fallback:** Same process/window → **`position`** and **`size`** of the window.
- **Windows:** **Not implemented** — `getFrontmostWindowBoundsWindows()` returns `null`, so overlay bounds from this path are not available on Windows.

So today, **the grey overlay is positioned around the frontmost app window only on macOS**, using AppleScript against System Events.

### 2. **DetectionManager + ActiveWindowMonitor (app name, title; bounds only on Windows/Linux)**

- **ActiveWindowMonitor** (`src/main/detection/ActiveWindowMonitor.ts`):
  - **macOS:** Uses **AppleScript only** (no `active-win`). Returns app name and window title, but **bounds are a placeholder** `{ x: 0, y: 0, width: 800, height: 600 }`.
  - **Windows/Linux:** Uses **active-win** `activeWindow()`, which **does** return real `bounds` (x, y, width, height).
- **ScreenCaptureManager** uses DetectionManager when available. When **active-win** is used (Windows/Linux), overlay bounds can come from **active-win’s bounds**. When only AppleScript is used (macOS), bounds come from the **OverlayManager** fallback (AppleScript AXFrame/position/size).

So:
- **macOS:** Overlay “around the app” = **AppleScript** (System Events) in `PlatformSpecificManager.getFrontmostWindowBoundsDarwin()`.
- **Windows:** active-win provides bounds, but OverlayManager does not; if DetectionManager’s bounds are used, overlay can still work; otherwise you need a Windows implementation of `getFrontmostWindowBounds`.

---

## Methods to Track the Frontmost Window (Summary)

| Method | Platform | What it gives | Used in this app? |
|--------|----------|----------------|--------------------|
| **AppleScript (System Events)** | macOS | Frontmost process, window 1, AXFrame or position/size | ✅ Yes – main source of overlay bounds on macOS |
| **active-win** | macOS, Windows, Linux | App name, title, **bounds**, URL (macOS only) | ✅ Yes – for app/title/URL; bounds on Windows/Linux; on macOS currently bypassed (AppleScript used instead) |
| **GetWindowRect / GetForegroundWindow** | Windows | Foreground window handle → rectangle in screen coordinates | ❌ No – `getFrontmostWindowBoundsWindows()` is a stub |
| **PowerShell + Add-Type (P/Invoke)** | Windows | Same as above, from a script | ❌ No |
| **Linux (X11/Wayland)** | Linux | Depends on compositor (e.g. X11 window geometry) | Via active-win if supported |
| **Google Apps Script** | N/A | Only Google Workspace context | ❌ Not applicable to desktop window tracking |

---

## Recommended Directions

### 1. **Implement Windows frontmost-window bounds**

So the grey overlay can wrap the active window on Windows too:

- **Option A – PowerShell + Win32:** Run PowerShell that uses Add-Type to call `GetForegroundWindow` and `GetWindowRect`, then parse the RECT (Left, Top, Right, Bottom) and return x, y, width, height. Your main process would spawn `powershell.exe -Command "..."` and parse stdout (similar to how you run `osascript` on macOS).
- **Option B – active-win only:** Rely on DetectionManager + active-win on Windows; ensure overlay bounds always come from `info.bounds` / `state.bounds` when available, and that you never require OverlayManager for Windows (or implement OverlayManager’s Windows path by calling the same logic that provides bounds to DetectionManager).
- **Option C – Native addon / node-ffi:** A small native module or `node-ffi` binding to `user32.dll` (`GetForegroundWindow`, `GetWindowRect`) for lower overhead and no PowerShell dependency.

### 2. **Optional: Use active-win for bounds on macOS**

- active-win can return real bounds on macOS (with proper permissions). You could:
  - Switch **ActiveWindowMonitor** on macOS to use **active-win** for bounds when available, and only fall back to AppleScript for app name/title if needed.
  - That would give one consistent source of bounds (active-win) across platforms and might reduce the need for a separate AppleScript call in **OverlayManager** when DetectionManager is used (you’d use DetectionManager’s bounds when available and only call OverlayManager when they’re missing).

### 3. **Keep AppleScript as the fallback on macOS**

- AppleScript + System Events is robust for “frontmost process, window 1, frame” and works with **Accessibility** permission. Keeping it as fallback ensures the overlay still works when active-win is unavailable or fails.

### 4. **Do not use Google Apps Script for this**

- “App Script” in the sense of **Google Apps Script** cannot track desktop application windows or control overlay positioning on the user’s machine. Use desktop-side scripts (AppleScript, PowerShell) or native APIs (active-win, Win32) as above.

---

## References

- **AppleScript (macOS):** System Events, `AXFrame`, `position`, `size` of window – e.g. [AppleScript get bounds of every open window](https://stackoverflow.com/questions/52301680/applescript-get-the-bounds-of-every-open-window), [Controlling OS X windows](https://stackoverflow.com/questions/1730859/controlling-osx-windows).
- **Windows:** [GetWindowRect (winuser.h)](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowrect), [Getting window position and size in PowerShell](https://stackoverflow.com/questions/27132996/getting-window-position-and-size-in-powershell).
- **active-win:** [npm active-win](https://www.npmjs.com/package/active-win) – returns bounds on all platforms; URL only on macOS.

---

## Summary

- The **grey overlay is already drawn around the frontmost application window on macOS** using **AppleScript** (System Events → AXFrame or position/size) in `PlatformSpecificManager.getFrontmostWindowBoundsDarwin()`.
- **Google Apps Script** is not a method for tracking the desktop application window; use **desktop scripts (AppleScript, PowerShell)** or **native/Node APIs (active-win, Win32)** instead.
- To get the same behavior on **Windows**, implement **getFrontmostWindowBoundsWindows()** (e.g. via PowerShell + GetForegroundWindow/GetWindowRect or by relying on active-win and ensuring overlay bounds flow from DetectionManager).
- Optionally, use **active-win for bounds on macOS** as well to unify the source of bounds and reduce dependency on a second AppleScript call for overlay positioning.
