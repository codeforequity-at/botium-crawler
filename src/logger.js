const winston = require('winston')
require('winston-daily-rotate-file')
const path = require('path')

const MAX_FILES = 30
const MAX_FILE_SIZE = '10m'
const LOG_DIR = path.join(__dirname, '..', 'log')

const transports = [
  new winston.transports.DailyRotateFile({
    name: 'file_all',
    dirname: LOG_DIR,
    maxFiles: MAX_FILES,
    filename: 'out.%DATE%.log',
    level: 'info',
    maxsize: MAX_FILE_SIZE
  })
]

module.exports = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports
})
