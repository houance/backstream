import pino from 'pino'
import path from 'path'

const logFile = path.resolve(process.cwd(), 'log', 'app.log');

const transport = pino.transport({
    targets: [
        // Target 1: Readable Console (Development)
        {
            target: 'pino-pretty',
            options: { colorize: true },
            level: 'info' // Only send info and above to console
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
            level: 'info'
        }
    ],
    options: {
        file: logFile,
        frequency: 'daily',
        size: '10m',
        mkdir: true,
        limit: { count: 7 } // Keep 1 week of logs
    }
})

export const logger = pino(transport)
