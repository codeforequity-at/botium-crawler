const { askUserFeedbackOnConsole, getBotiumDriver } = require('../../src/util')
const Crawler = require('../../src/Crawler')
const ConvoHandler = require('../../src/ConvoHandler')

let compiler

const run = async () => {
  console.log('Botium-Crawler started')
  try {
    const driver = getBotiumDriver('./botium.json')
    if (!driver) {
      throw new Error('Botium driver can not be created.')
    }
    compiler = driver.BuildCompiler()

    const crawler = new Crawler({ driver }, _askUserHandler)
    const convos = await crawler.crawl({ entryPoints: ['buttons'] })

    const decompiledConvos = await new ConvoHandler(compiler).decompileConvos({ convos })
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

    for (const utt of scriptObject.utterances) {
      console.log('------------------------------------------')
      console.log(utt.script)
    }
  }
  console.log('\n')
  for (const utt of decompiledConvos.generalUtterances) {
    console.log('==========================================')
    console.log(utt.script)
  }
  console.log('\n')
}

run().then(() => console.log('Botium-Crawler finished successfully'))
