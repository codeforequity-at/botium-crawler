#!/usr/bin/env node
const fs = require('fs')
const yargsCmd = require('yargs')
const Crawler = require('../src/Crawler')
const ConvoHandler = require('../src/ConvoHandler')
const { validationErrorHandler } = require('../src/util')

yargsCmd.usage('Botium Crawler CLI\n\nUsage: $0 [options]') // eslint-disable-line
  .help('help').alias('help', 'h')
  .version('version', require('../package.json').version).alias('version', 'V')
  .showHelpOnFail(true)
  .strict(true)
  .command({
    command: 'crawl',
    describe: 'Crawl the chatbot along buttons and generate test cases.',
    builder: (yargs) => {
      yargs.option('configFile', {
        describe: 'Botium config json file path',
        type: 'string',
        require: true
      })
      yargs.option('entryPoints', {
        describe: 'Entry points of the crawler\n (e.g.:  --entryPoints \'hi\' \'special entry point\')',
        type: 'array',
        default: []
      })
      yargs.option('depth', {
        describe: 'The depth of the crawling',
        type: 'number',
        default: 5
      })
      yargs.option('ignoreSteps', {
        describe: 'These steps are going to be skipped during the crawling\n ' +
          '(e.g.:  --entryPoints \'something\' \'ignore this message\')',
        type: 'array',
        default: []
      })
      yargs.option('incomprehensions', {
        describe: 'Expressions that the bot answer, when don\'t understand something\n ' +
          '(e.g.:  --entryPoints \'Unkown command\' \'I don\'t understand\')',
        type: 'array',
        default: []
      })
      yargs.option('output', {
        describe: 'Output directory',
        type: 'string',
        default: './generated'
      })
    },
    handler: async (argv) => {
      const {
        output,
        configFile,
        entryPoints,
        depth,
        incomprehensions,
        ignoreSteps
      } = argv

      const config = JSON.parse(fs.readFileSync(configFile, 'utf8'))
      if (!config.botium) {
        console.error(`'botium' property is missing from the '${configFile}' file`)
        return
      }

      try {
        console.log('Crawler started...')
        const crawler = new Crawler({ config: config.botium, incomprehensions }, validationErrorHandler)
        const convos = await crawler.crawl({
          entryPoints,
          depth,
          ignoreSteps
        })

        console.log('Saving testcases...')
        await new ConvoHandler(crawler.compiler).persistConvosInFiles(convos, output)
        console.log('Crawler finished successfully')
      } catch (e) {
        console.error('Botium-Crawler failed: ', e)
      }
    }
  })
  .argv
