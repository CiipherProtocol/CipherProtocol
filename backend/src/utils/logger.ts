/* eslint-disable no-console */
const timestamp = () => new Date().toISOString();

const logger = {
  info: (...args: unknown[]) => console.log(`[${timestamp()}] INFO`, ...args),
  warn: (...args: unknown[]) => console.warn(`[${timestamp()}] WARN`, ...args),
  error: (...args: unknown[]) => console.error(`[${timestamp()}] ERROR`, ...args),
  debug: (...args: unknown[]) => {
    if (process.env.NODE_ENV !== 'production') console.debug(`[${timestamp()}] DEBUG`, ...args);
  },
};

export default logger;
