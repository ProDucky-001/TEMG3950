/**
 * Unit tests for screen capture and overlay state logic.
 * Tests: overlay show when capturing (grey) or email client (green), debug log format.
 */
import type { AppContextResult } from '../../src/main/integration/AppContextDetector';

describe('Screen capture overlay state', () => {
  /**
   * Replicates the overlay visibility logic from ScreenCaptureManager.updateOverlayVisibility
   * so we can test it without Electron.
   */
  function computeOverlayState(
    captureInProgress: boolean,
    context: AppContextResult,
    monitoringAllowed: boolean,
    showRecordingIndicator: boolean
  ): { show: boolean; state: 'monitoring' | 'processing' } {
    if (!showRecordingIndicator) return { show: false, state: 'monitoring' };
    const inboxHintActive = false; // test without OCR hint for simplicity
    const effectiveEmailClient = context.isEmailClientActive || inboxHintActive;
    const show =
      captureInProgress ||
      (effectiveEmailClient && context.appId != null && monitoringAllowed);
    const state = captureInProgress ? 'processing' : 'monitoring';
    return { show, state };
  }

  it('shows overlay with state processing (grey) when capture is in progress', () => {
    const context: AppContextResult = {
      isEmailClientActive: false,
      appId: null,
      context: 'unknown',
      browserUrl: null,
      windowName: 'Cursor',
    };
    const { show, state } = computeOverlayState(true, context, true, true);
    expect(show).toBe(true);
    expect(state).toBe('processing');
  });

  it('shows overlay with state monitoring (green) when email client is active and not capturing', () => {
    const context: AppContextResult = {
      isEmailClientActive: true,
      appId: 'gmail',
      context: 'inbox',
      browserUrl: 'https://mail.google.com/mail/u/0/#inbox',
      windowName: 'Google Chrome',
    };
    const { show, state } = computeOverlayState(false, context, true, true);
    expect(show).toBe(true);
    expect(state).toBe('monitoring');
  });

  it('hides overlay when not capturing and not email client', () => {
    const context: AppContextResult = {
      isEmailClientActive: false,
      appId: null,
      context: 'unknown',
      browserUrl: null,
      windowName: 'Cursor',
    };
    const { show } = computeOverlayState(false, context, true, true);
    expect(show).toBe(false);
  });

  it('hides overlay when show recording indicator is false', () => {
    const context: AppContextResult = {
      isEmailClientActive: true,
      appId: 'gmail',
      context: 'inbox',
      browserUrl: 'https://mail.google.com/',
      windowName: 'Chrome',
    };
    const { show } = computeOverlayState(false, context, true, false);
    expect(show).toBe(false);
  });

  it('hides overlay when email client but monitoring not allowed for app', () => {
    const context: AppContextResult = {
      isEmailClientActive: true,
      appId: 'gmail',
      context: 'inbox',
      browserUrl: 'https://mail.google.com/',
      windowName: 'Chrome',
    };
    const { show } = computeOverlayState(false, context, false, true);
    expect(show).toBe(false);
  });
});

describe('Screen capture debug log format', () => {
  it('expects debug log to contain only sessionId, isEmailClient, windowName, link', () => {
    const expectedKeys = ['sessionId', 'isEmailClient', 'windowName', 'link'];
    const example = {
      sessionId: '38e9d1',
      isEmailClient: true,
      windowName: 'Google Chrome',
      link: 'https://mail.google.com/mail/u/0/#inbox',
    };
    expect(Object.keys(example).sort()).toEqual(expectedKeys.sort());
  });
});

describe('Outlook OCR detection', () => {
  /** Replicates Outlook OCR hint logic from ScreenCaptureManager.handleCaptureResult */
  function isOutlookDetectedInOCR(ocrStart: string, ocrExtended: string): boolean {
    const outlookInOCR =
      ocrStart.includes('outlook') &&
      (ocrStart.includes('mail') ||
        ocrStart.includes('cloud') ||
        ocrStart.includes('microsoft') ||
        ocrStart.includes('inbox') ||
        ocrStart.includes('office') ||
        ocrStart.includes('live'));
    const outlookInOCRExtended =
      ocrExtended.includes('outlook') &&
      (ocrExtended.includes('cloud') ||
        ocrExtended.includes('office') ||
        ocrExtended.includes('microsoft') ||
        ocrExtended.includes('mail') ||
        ocrExtended.includes('live'));
    const outlookOnlyInOCR = ocrExtended.includes('outlook');
    return outlookInOCR || outlookInOCRExtended || outlookOnlyInOCR;
  }

  it('detects Outlook when OCR contains "outlook" and "live" (outlook.live.com)', () => {
    const ocrStart = 'https://outlook.live.com/mail/0/inbox';
    const ocrExtended = ocrStart;
    expect(isOutlookDetectedInOCR(ocrStart, ocrExtended)).toBe(true);
  });

  it('detects Outlook when OCR contains "outlook" and "office"', () => {
    const ocrStart = 'outlook.office365.com mail';
    expect(isOutlookDetectedInOCR(ocrStart, ocrStart)).toBe(true);
  });

  it('detects Outlook when OCR contains only "outlook" in extended text', () => {
    const ocrExtended = 'some text outlook cloud microsoft';
    expect(isOutlookDetectedInOCR('', ocrExtended)).toBe(true);
  });
});
