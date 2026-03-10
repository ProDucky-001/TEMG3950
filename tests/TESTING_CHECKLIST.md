# ScamShield Testing Checklist

Use this checklist to verify functionality after implementing all phases.

## Performance Testing

- [ ] Grey UI appears on active window within 200ms of switching applications
- [ ] Green UI appears within 450ms when switching to email client
- [ ] OCR processing completes within 300ms (Vision on macOS) or 1 second (Tesseract fallback)
- [ ] Debug logs appear every 2 seconds without blocking UI

## Functional Testing

- [ ] Firefox URLs are now detected (not showing N/A)
- [ ] AppleScript is no longer used for window detection (replaced by active-win or equivalent)
- [ ] Hovered links are detected in Firefox and other browsers
- [ ] Scam alerts appear when suspicious content is detected
- [ ] Clipboard monitoring works for URL detection

## Cross-Platform Testing

- [ ] App runs without crashing on macOS
- [ ] App runs without crashing on Windows
- [ ] Permissions are requested properly on both platforms
- [ ] UI positioning works correctly on different screen configurations

## Debug Log Verification

- [ ] Log format matches: `Application | Tab Title | Email/Not-Email | URL | Content`
- [ ] Logs are not repeated when content hasn't changed
- [ ] N/A is shown for URLs when not in browser
- [ ] Content is truncated to exactly 100 characters

## IPC / Integration

- [ ] Dashboard receives `window:update` when active window changes
- [ ] Dashboard receives `email:detected` when email app/tab is active
- [ ] Scam alert modal appears when `scam:alert` is received (or `subscribeAlertPushed`)
- [ ] `requestCapture()` triggers one capture when called from renderer
- [ ] `dismissAlert()` is called when user dismisses the in-app alert
- [ ] `status:update` is received when monitoring is toggled
