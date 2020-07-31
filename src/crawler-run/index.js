const fs = require('fs')
const path = require('path')
const slugify = require('slugify')
const { Capabilities } = require('botium-core')
const { askUserFeedbackOnConsole, getBotiumDriver } = require('../util')
const Crawler = require('../Crawler')
const ConvoHandler = require('../ConvoHandler')

const SCRIPTS_OUTPUT_DIR = 'scripts'

let recycleUserFeedback
let output
let incomprehension
let compiler

const handler = async (argv) => {
  recycleUserFeedback = argv.recycleUserFeedback
  output = argv.output
  incomprehension = argv.incomprehension
  const {
    config,
    entryPoints,
    numberOfWelcomeMessages,
    depth,
    ignoreSteps,
    mergeUtterances
  } = argv

  const driver = getBotiumDriver(config)
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
    const crawler = new Crawler({ driver }, _askUserHandler, _validator)
    const convos = await crawler.crawl({
      entryPoints,
      numberOfWelcomeMessages,
      depth,
      ignoreSteps
    })

    console.log('Saving testcases...')
    const decompiledConvos = await new ConvoHandler(compiler).decompileConvos({ convos, mergeUtterances })
    _persistScriptsInFiles(decompiledConvos)
    console.log('Crawler finished successfully')
  } catch (e) {
    console.error('Botium-Crawler failed: ', e)
  }
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

    scriptObject.utterances.forEach((utterance) => {
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
      describe: 'Botium config json file path',
      type: 'string',
      require: true
    })
    yargs.option('output', {
      describe: 'Output directory',
      type: 'string',
      default: './crawler-result'
    })
    yargs.option('entryPoints', {
      describe: 'Entry points of the crawler\n (e.g.:  --entryPoints \'hi\' \'special entry point\')\n' +
        'In case of empty entry points the crawler start with the auto welcome message (see \'numberOfWelcomeMessages\' param),' +
        ' if the bot has no auto welcome message the crawler goes with [\'hello\', \'help\']',
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
        '(e.g.:  --ignoreSteps \'something\' \'ignore this message\')',
      type: 'array',
      default: []
    })
    yargs.option('incomprehension', {
      describe: 'Expressions that the bot answer, when don\'t understand something\n ' +
        '(e.g.:  --incomprehension \'Unkown command\' \'I don\'t understand\')',
      type: 'array',
      default: []
    })
    yargs.option('mergeUtterances', {
      describe: 'Merge the same utterances into one file',
      type: 'boolean',
      default: true
    })
    yargs.option('recycleUserFeedback', {
      describe: 'Reuse and store user answers into a userFeedback.json file in the \'output\' param given directory',
      type: 'boolean',
      default: true
    })
  },
  handler
}
