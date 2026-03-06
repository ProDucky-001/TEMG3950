/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  testMatch: ['**/tests/**/*.test.ts', '**/tests/**/*.test.tsx'],
  modulePathIgnorePatterns: ['<rootDir>/out', '<rootDir>/release', '<rootDir>/node_modules'],
  collectCoverageFrom: [
    'src/main/**/*.ts',
    'src/renderer/**/*.tsx',
    'src/shared/**/*.ts',
    '!src/main/index.ts',
    '!**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  moduleNameMapper: {
    '^electron-store$': '<rootDir>/__mocks__/electron-store.ts',
    '^electron$': '<rootDir>/__mocks__/electron.ts',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'json'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: false }],
  },
  testTimeout: 10000,
  verbose: true,
};
