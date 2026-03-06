const PREFIX = '[ScamShield]'

export const logger = {
  info(message: string, ...args: unknown[]): void {
    console.info(`${PREFIX}`, message, ...args)
  },
  warn(message: string, ...args: unknown[]): void {
    console.warn(`${PREFIX}`, message, ...args)
  },
  error(message: string, ...args: unknown[]): void {
    console.error(`${PREFIX}`, message, ...args)
  },
  debug(message: string, ...args: unknown[]): void {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`${PREFIX}`, message, ...args)
    }
  },
}
