const { BotDriver } = require('botium-core')
const { askUserFeedbackOnConsole } = require('../../src/util')
const Crawler = require('../../src/Crawler')
const ConvoHandler = require('../../src/ConvoHandler')

let compiler

const run = async () => {
  console.log('Botium-Crawler started')
  try {
    const driver = new BotDriver()
    if (!driver) {
      throw new Error('Botium driver can not be created.')
    }
    compiler = driver.BuildCompiler()

    const crawler = new Crawler({ driver }, _askUserHandler)
    const crawlerResult = await crawler.crawl({ entryPoints: ['buttons'] })

    if (crawlerResult.err) {
      console.log('Crawler finished with error: ', crawlerResult.err)
    }

    const decompiledConvos = await new ConvoHandler(compiler).decompileConvos({ crawlerResult })
    _logDecompiledConvosOnColsole(decompiledConvos)
  } catch (e) {
    console.log('Botium-Crawler failed: ', e)
  }
}

const _askUserHandler = async (stuckConversations) => {
  return askUserFeedbackOnConsole(stuckConversations, compiler, false)
}

const _logDecompiledConvosOnColsole = (decompiledConvos) => {
  console.log('\nResult:')
  for (const scriptObject of decompiledConvos.scriptObjects) {
    console.log('==========================================')
    console.log(scriptObject.script)

    if (scriptObject.botUtterances.length > 0) {
      console.log('--------------------BOT utterances----------------------')
      for (const utt of scriptObject.botUtterances) {
        console.log(utt.script + '\n')
      }
    }

    if (scriptObject.meUtterances.length > 0) {
      console.log('---------------------ME utterances---------------------')
      for (const utt of scriptObject.meUtterances) {
        console.log(utt.script + '\n')
      }
    }
  }
  if (decompiledConvos.generalUtterances.length > 0) {
    console.log('---------------------General utterances---------------------')
    for (const utt of decompiledConvos.generalUtterances) {
      console.log(utt.script + '\n')
    }
  }
  console.log('\n')
}

run().then(() => console.log('Botium-Crawler finished successfully'))
