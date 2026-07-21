import winston from 'winston'
import { join } from 'node:path'
import type { RuntimePaths } from './paths'

export function createLogger(paths: RuntimePaths): winston.Logger {
  return winston.createLogger({
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [
      new winston.transports.File({ filename: join(paths.get('Logs'), 'application.log'), maxsize: 5_000_000, maxFiles: 5 }),
      new winston.transports.Console({ format: winston.format.combine(winston.format.colorize(), winston.format.simple()) })
    ]
  })
}
