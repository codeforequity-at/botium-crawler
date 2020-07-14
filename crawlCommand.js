const fs = require('fs')
const _ = require('lodash')
const readlineSync = require('readline-sync')
const Crawler = require('./src/Crawler')
const ConvoHandler = require('./src/ConvoHandler')
const { validationErrorHandler } = require('./src/util')

const handler = async (argv) => {
  const {
    output,
    config,
    entryPoints,
    numberOfWelcomeMessages,
    depth,
    incomprehensions,
    ignoreSteps,
    mergeUtterances
  } = argv

  const configObject = JSON.parse(fs.readFileSync(config, 'utf8'))
  if (!configObject.botium) {
    console.error(`'botium' property is missing from the '${config}' file`)
    return
  }

  try {
    console.log('Crawler started...')
    const crawler = new Crawler({
      config: configObject.botium, incomprehensions
    }, validationErrorHandler, askUserHandler)
    const convos = await crawler.crawl({
      entryPoints,
      numberOfWelcomeMessages,
      depth,
      ignoreSteps
    })

    console.log('Saving testcases...')
    await new ConvoHandler(crawler.compiler).persistConvosInFiles({ convos, output, mergeUtterances })
    console.log('Crawler finished successfully')
  } catch (e) {
    console.error('Botium-Crawler failed: ', e)
  }
}

const askUserHandler = async (stuckConversations, crawler) => {
  const userResponses = stuckConversations.map(stuckConversation => ({ path: stuckConversation.path }))
  for (const stuckConversation of stuckConversations) {
    const script = crawler.compiler.Decompile([stuckConversation.convo], 'SCRIPTING_FORMAT_TXT')
    console.log(`\n---------------------------------------\n${script}
    \n---------------------------------------\n`)
    const contiueAnswer = readlineSync.question('This path is stucked before reaching depth. \n' +
    'Would you like to continue with your own answers?  [yes, no, no all]: ', { limit: ['yes', 'no', 'no all'] })

    if (contiueAnswer === 'no all') {
      break
    }

    if (contiueAnswer === 'yes') {
      const userResponse = _.find(userResponses, userResponse => userResponse.path === stuckConversation.path)
      userResponse.texts = []
      let additionalAnswer = true
      let i = 1
      while (additionalAnswer) {
        userResponse.texts.push(readlineSync.question(`Enter your ${i++}. answer: `))
        additionalAnswer = readlineSync.keyInYN('Do you want to add additional answers?')
      }
    }
  }
  return userResponses
}

module.exports = {
  command: 'crawler-run',
  describe: 'Crawl the chatbot along buttons and generate test cases.',
  builder: (yargs) => {
    yargs.option('config', {
      describe: 'Botium config json file path',
      type: 'string',
      require: true
    })
    yargs.option('entryPoints', {
      describe: 'Entry points of the crawler\n (e.g.:  --entryPoints \'hi\' \'special entry point\')',
      type: 'array',
      default: []
    })
    yargs.option('numberOfWelcomeMessages', {
      describe: 'The number of welcome messages to wait for by the crawler.',
      type: 'number',
      default: 0
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
    yargs.option('mergeUtterances', {
      describe: 'Merge the same utterances into one file',
      type: 'boolean',
      default: true
    })
  },
  handler
}
