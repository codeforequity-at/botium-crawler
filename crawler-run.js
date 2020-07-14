const fs = require('fs')
const _ = require('lodash')
const readlineSync = require('readline-sync')
const Crawler = require('./src/Crawler')
const ConvoHandler = require('./src/ConvoHandler')
const { validationErrorHandler } = require('./src/util')

let recycleUserFeedbacks
let userFeedbacksPath

const handler = async (argv) => {
  recycleUserFeedbacks = argv.recycleUserFeedbacks
  userFeedbacksPath = argv.userFeedbacksPath
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
    if (fs.existsSync(output) && fs.readdirSync(output).length > 0) {
      throw new Error(`The output path '${output}' has to be empty`)
    }
    const crawler = new Crawler({
      config: configObject.botium, incomprehensions
    }, validationErrorHandler, _askUserHandler)
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

const _askUserHandler = async (stuckConversations, crawler) => {
  const userFeedbacks = []
  let userFeedbackChanged = false
  if (recycleUserFeedbacks && fs.existsSync(userFeedbacksPath)) {
    userFeedbacks.push(...JSON.parse(fs.readFileSync(userFeedbacksPath, 'utf8')))
  }
  const userResponses = stuckConversations.map(stuckConversation => ({ path: stuckConversation.path }))
  for (const stuckConversation of stuckConversations) {
    const userResponse = _.find(userResponses, userResponse => userResponse.path === stuckConversation.path)
    userResponse.texts = []
    if (recycleUserFeedbacks && userFeedbacks.length > 0) {
      const userFeedbackToReuse = _.find(userFeedbacks,
        userFeedback => userFeedback.path === stuckConversation.path)
      if (userFeedbackToReuse) {
        userResponse.texts.push(...userFeedbackToReuse.answers)
      }
    }

    if (userResponse.texts.length === 0) {
      const script = crawler.compiler.Decompile([stuckConversation.convo], 'SCRIPTING_FORMAT_TXT')
      console.log(`\n---------------------------------------\n${script}
    \n---------------------------------------\n`)
      const contiueAnswer = readlineSync.question('This path is stucked before reaching depth. \n' +
    'Would you like to continue with your own answers?  [yes, no, no all]: ', { limit: ['yes', 'no', 'no all'] })

      if (contiueAnswer === 'no all') {
        break
      }

      if (contiueAnswer === 'yes') {
        let additionalAnswer = true
        let i = 1
        while (additionalAnswer) {
          userResponse.texts.push(readlineSync.question(`Enter your ${i++}. answer: `))
          additionalAnswer = readlineSync.keyInYN('Do you want to add additional answers?')
        }
        if (recycleUserFeedbacks) {
          userFeedbacks.push({
            path: userResponse.path,
            script,
            answers: userResponse.texts
          })
          userFeedbackChanged = true
        }
      }
    }
  }
  if (recycleUserFeedbacks && userFeedbackChanged) {
    fs.writeFileSync(userFeedbacksPath, JSON.stringify(userFeedbacks), 'utf8')
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
    yargs.option('recycleUserFeedbacks', {
      describe: 'Reuse and store user answers into a json file give in \'userFeedbacksPath\' param',
      type: 'boolean',
      default: true
    })
    yargs.option('userFeedbacksPath', {
      describe: 'Define the path of a json file, the user feedback can be read from and store into.',
      type: 'string',
      default: './userFeedbacks.json'
    })
  },
  handler
}
