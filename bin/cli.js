#!/usr/bin/env node
const yargsCmd = require('yargs')

yargsCmd.usage('Botium Crawler CLI\n\nUsage: $0 [options]') // eslint-disable-line
  .help('help').alias('help', 'h')
  .version('version', require('../package.json').version).alias('version', 'V')
  .showHelpOnFail(true)
  .strict(true)
  .command(require('../src/crawler-run'))
  .command(require('../src/crawler-feedbacks'))
  .argv
