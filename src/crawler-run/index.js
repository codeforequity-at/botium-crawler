const fs = require('fs')
const path = require('path')
const slugify = require('slugify')
const debug = require('debug')
const { Capabilities, BotDriver } = require('botium-core')
const { askUserFeedbackOnConsole } = require('../util')
const Crawler = require('../Crawler')
const ConvoHandler = require('../ConvoHandler')

const SCRIPTS_OUTPUT_DIR = 'scripts'

let recycleUserFeedback
let output
let incomprehension
let compiler

const handler = async (argv) => {
  const params = _getAndStoreParams(argv)

  const driver = new BotDriver()
  if (!driver) {
    return
  }
  compiler = driver.BuildCompiler()

  try {
    console.log('Crawler started...')
    const scriptOutput = path.join(output, SCRIPTS_OUTPUT_DIR)
    if (fs.existsSync(scriptOutput) && fs.readdirSync(scriptOutput).length > 0) {
      throw new Error(`The output path '${scriptOutput}' has to be empty`)
    }

    const userFeedbacks = []
    if (recycleUserFeedback) {
      const userFeedbacksPath = path.join(output, 'userFeedback.json')
      if (fs.existsSync(userFeedbacksPath)) {
        userFeedbacks.push(...JSON.parse(fs.readFileSync(userFeedbacksPath, 'utf8')))
      }
    }

    const crawler = new Crawler({ driver }, _askUserHandler, _validator)
    const convos = await crawler.crawl(Object.assign(params, { userAnswers: userFeedbacks }))

    console.log('Saving testcases...')
    const decompiledConvos = await new ConvoHandler(compiler).decompileConvos({ convos, mergeUtterances: params.mergeUtterances })
    _persistScriptsInFiles(decompiledConvos)
    console.log('Crawler finished successfully')
  } catch (e) {
    console.error('Botium-Crawler failed: ', e)
  }
}

const _getAndStoreParams = (argv) => {
  let storedParams = {}
  if (fs.existsSync('./botium-crawler.json')) {
    storedParams = JSON.parse(fs.readFileSync('./botium-crawler.json'))
  }

  recycleUserFeedback = argv.recycleUserFeedback !== undefined
    ? argv.recycleUserFeedback : storedParams.recycleUserFeedback !== undefined
      ? storedParams.recycleUserFeedback : true
  output = argv.output || storedParams.output || './crawler-result'
  incomprehension = argv.incomprehension || storedParams.incomprehension || []
  const mergeUtterances = argv.mergeUtterances !== undefined
    ? argv.mergeUtterances : storedParams.mergeUtterances !== undefined
      ? storedParams.mergeUtterances : true

  const params = {
    recycleUserFeedback,
    output,
    incomprehension,
    config: argv.config || storedParams.config,
    entryPoints: argv.entryPoints || storedParams.entryPoints || [],
    numberOfWelcomeMessages: argv.numberOfWelcomeMessages || storedParams.numberOfWelcomeMessages || 0,
    depth: argv.depth || storedParams.depth || 5,
    exitCriteria: argv.exitCriteria || storedParams.exitCriteria || [],
    mergeUtterances,
    waitForPrompt: argv.waitForPrompt || storedParams.waitForPrompt || 100
  }
  if (params.config) {
    process.env.BOTIUM_CONFIG = params.config
  }

  if (argv.verbose) {
    debug.enable('botium-*')
  }

  if (argv.storeParams) {
    fs.writeFileSync('./botium-crawler.json', JSON.stringify(params, 0, 2), 'utf8')
  }
  return params
}

const _persistScriptsInFiles = ({ scriptObjects, generalUtterances }) => {
  const scriptOutDir = path.join(output, SCRIPTS_OUTPUT_DIR)
  if (!fs.existsSync(scriptOutDir)) {
    fs.mkdirSync(scriptOutDir)
  } else if (fs.readdirSync(scriptOutDir).length > 0) {
    throw new Error(`The output path '${scriptOutDir}' has to be empty`)
  }

  scriptObjects.forEach((scriptObject) => {
    const script = scriptObject.script
    const scriptName = path.join(scriptOutDir,
      slugify(
        script.substring(0, script.indexOf(compiler.caps[Capabilities.SCRIPTING_TXT_EOL]))).toUpperCase() +
      '.convo.txt')
    fs.writeFileSync(scriptName, script)
    console.log(`The '${scriptName}' file is persisted`)

    scriptObject.botUtterances.forEach((utterance) => {
      const utteranceName = path.join(scriptOutDir, utterance.name)
      fs.writeFileSync(utteranceName + '.utterances.txt', utterance.script)
    })

    scriptObject.meUtterances.forEach((utterance) => {
      const utteranceName = path.join(scriptOutDir, utterance.name)
      fs.writeFileSync(utteranceName + '.utterances.txt', utterance.script)
    })
  })

  generalUtterances.forEach((utterance) => {
    const utteranceName = path.join(scriptOutDir, utterance.name)
    fs.writeFileSync(utteranceName + '.utterances.txt', utterance.script)
  })
}

const _askUserHandler = async (stuckConversations) => {
  return askUserFeedbackOnConsole(stuckConversations, compiler, recycleUserFeedback, output)
}

const _validator = (botAnswers, userMessage) => {
  for (const incomprehensionItem of incomprehension) {
    for (const botAnswer of botAnswers) {
      if (compiler.Match(botAnswer, incomprehensionItem)) {
        console.log('User message is failure to understand by the bot', {
          userMessage,
          botAnswer
        })
        _logError('User message is failure to understand by the bot', {
          userMessage,
          botAnswer
        })
      }
    }
  }
}

const _logError = (message, payload) => {
  if (!fs.existsSync(output)) {
    fs.mkdirSync(output)
  }
  const error = fs.createWriteStream(path.join(output, 'error.log'), { flags: 'a' })
  error.write(`[${new Date().toISOString()}] ${message}:\n`)
  error.write(`${JSON.stringify(payload, 0, 2)}\n\n`)
  error.end()
}

module.exports = {
  command: 'crawler-run',
  describe: 'Crawl the chatbot along buttons and generate test cases.',
  builder: (yargs) => {
    yargs.option('config', {
      describe: 'Botium config json file path. (default: \'botium.json\')',
      type: 'string'
    })
    yargs.option('output', {
      describe: 'Output directory (default: \'./crawler-result\')',
      type: 'string'
    })
    yargs.option('entryPoints', {
      describe: 'Entry points of the crawler\n (e.g.:  --entryPoints \'hi\' \'special entry point\')\n' +
        'In case of empty entry points the crawler start with the auto welcome message (see \'numberOfWelcomeMessages\' param),' +
        ' if the bot has no auto welcome message the crawler goes with [\'hello\', \'help\']',
      type: 'array'
    })
    yargs.option('numberOfWelcomeMessages', {
      describe: 'The number of welcome messages to wait for by the crawler. (default: 0)',
      type: 'number'
    })
    yargs.option('depth', {
      describe: 'The depth of the crawling. (default: 5)',
      type: 'number'
    })
    yargs.option('exitCriteria', {
      describe: 'If the button text or payload match with any of these value in the array, then the crawler exit from that conversation at that point.\n ' +
        '(e.g.:  --exitCriteria \'something\' \'exit at this message\')',
      type: 'array'
    })
    yargs.option('incomprehension', {
      describe: 'Expressions that the bot answer, when don\'t understand something\n ' +
        '(e.g.:  --incomprehension \'Unkown command\' \'I don\'t understand\')',
      type: 'array'
    })
    yargs.option('mergeUtterances', {
      describe: 'Merge the same utterances into one file. (default: true)',
      type: 'boolean'
    })
    yargs.option('recycleUserFeedback', {
      describe: 'Reuse and store user answers into a userFeedback.json file in the \'output\' param given directory. ' +
        '(default: true)',
      type: 'boolean'
    })
    yargs.option('waitForPrompt', {
      describe: 'Milliseconds to wait for the bot to present the response. (default: 100)',
      type: 'number'
    })
    yargs.option('storeParams', {
      describe: 'Store all CLI parameters in \'./botium-crawler.json\' file and ' +
        'reuse these params if the file is there in the root directory.',
      type: 'boolean',
      default: false
    })
    yargs.option('verbose', {
      describe: 'Verbose developer log on console',
      type: 'boolean',
      default: false
    })
  },
  handler
}
