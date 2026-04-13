import pino from 'pino'
import path from 'path'
import { env } from '../../env/env'

const logFile = path.resolve(env.LOG_FOLDER, 'app.log');

const transport = pino.transport({
    targets: [
        // Target 1: Readable Console (Development)
        {
            target: 'pino-pretty',
            options: {
                colorize: true,
                // This ensures the multi-line SQL doesn't get squashed into one line
                messageFormat: '{msg} \n\x1b[36m{sql}\x1b[0m',
                ignore: 'pid,hostname,sql' // Hide the raw 'sql' key since we put it in messageFormat
            },
            level: env.LOG_LEVEL
        },
        // Target 2: Rotating File (Production)
        {
            target: 'pino-roll',
            options: {
                file: logFile,
                frequency: 'daily',
                size: '10m',
                mkdir: true,
                limit: { count: 7 }
            },
            level: ['debug', 'trace', 'silent'].includes(env.LOG_LEVEL) ? 'info' : env.LOG_LEVEL,
        }
    ]
})

export const logger = pino({ level: 'trace' }, transport)
