/**
 * Jest manual mock for 'electron'.
 * Used when testing main process code that imports from 'electron'.
 */
const mockNotification = {
  show: jest.fn(),
  on: jest.fn(),
};

const mockSession = {
  defaultSession: {
    on: jest.fn(),
  },
};

const mockNet = {
  request: jest.fn(() => ({
    on: jest.fn(function (this: unknown) { return this; }),
    end: jest.fn(),
  })),
};

const mockApp = {
  getLoginItemSettings: jest.fn(() => ({ openAtLogin: false })),
  setLoginItemSettings: jest.fn(),
  disableHardwareAcceleration: jest.fn(),
  whenReady: jest.fn(() => Promise.resolve()),
  on: jest.fn(),
  dock: { hide: jest.fn() },
};

const mockIpcMain = {
  handle: jest.fn(),
  on: jest.fn(),
};

const mockShell = {
  openExternal: jest.fn(),
};

const mockPowerMonitor = {
  on: jest.fn(),
  getSystemIdleTime: jest.fn(() => Promise.resolve(0)),
};

export = {
  app: mockApp,
  ipcMain: mockIpcMain,
  Notification: jest.fn(() => mockNotification),
  shell: mockShell,
  powerMonitor: mockPowerMonitor,
  session: mockSession,
  net: mockNet,
};
