type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const isDev = import.meta.env.DEV;

function log(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
  const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (meta) fn(`${prefix} ${msg}`, meta);
  else fn(`${prefix} ${msg}`);

  if (level === 'debug') {
    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke('log_to_file', { level, message: `${prefix} ${msg}`, meta: meta ? JSON.stringify(meta) : '' });
    }).catch(() => {});
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => log('debug', msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) => log('info', msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log('warn', msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log('error', msg, meta),
};
