const fs = require('fs')
const path = require('path')
const assert = require('chai').assert
const ConvoHandler = require('../../src/ConvoHandler')
const { BotDriver } = require('botium-core')
const CONVOS_DIR = 'convos'

describe('ConvoHandler test', function () {
  it('decompile one simple convo', async function () {
    const crawlerResult = {
      err: 'error'
    }
    crawlerResult.convos = JSON.parse(fs.readFileSync(path.resolve(__dirname, CONVOS_DIR, 'one_simple_convo.json')))
    const driver = new BotDriver()
    const compiler = driver.BuildCompiler()
    const decompiledConvos = await new ConvoHandler(compiler)
      .decompileConvos({ crawlerResult, mergeUtterances: false })
    assert.equal(decompiledConvos.err, 'error')
    assert.equal(decompiledConvos.scriptObjects.length, 1)
    assert.equal(decompiledConvos.scriptObjects[0].botUtterances.length, 1)
    assert.equal(decompiledConvos.scriptObjects[0].script,
`test convo

#me
meText

#bot
UTT_TEST-CONVO_BOT_1
`
    )
  })

  it('decomplile two simple convo without merge utterances', async function () {
    const crawlerResult = {}
    crawlerResult.convos = JSON.parse(fs.readFileSync(path.resolve(__dirname, CONVOS_DIR, 'two_simple_convos.json')))
    const driver = new BotDriver()
    const compiler = driver.BuildCompiler()
    const decompiledConvos = await new ConvoHandler(compiler)
      .decompileConvos({ crawlerResult, mergeUtterances: false })
    assert.equal(decompiledConvos.scriptObjects.length, 2)
    assert.equal(decompiledConvos.scriptObjects[0].botUtterances.length, 1)
    assert.equal(decompiledConvos.scriptObjects[0].script,
      `test convo 1

#me
meText

#bot
UTT_TEST-CONVO-1_BOT_1
`
    )
  })

  it('decomplile two simple convo with merge utterances', async function () {
    const crawlerResult = {}
    crawlerResult.convos = JSON.parse(fs.readFileSync(path.resolve(__dirname, CONVOS_DIR, 'two_simple_convos.json')))
    const driver = new BotDriver()
    const compiler = driver.BuildCompiler()
    const decompiledConvos = await new ConvoHandler(compiler)
      .decompileConvos({ crawlerResult, mergeUtterances: true })
    assert.equal(decompiledConvos.scriptObjects.length, 2)
    assert.equal(decompiledConvos.scriptObjects[0].botUtterances.length, 0)
    assert.equal(decompiledConvos.scriptObjects[0].script,
      `test convo 1

#me
meText

#bot
UTT_M1_BOTTEXT_BOT
`
    )
  })

  it('decomplile two complex convo with merge utterances', async function () {
    const crawlerResult = {}
    crawlerResult.convos = JSON.parse(fs.readFileSync(path.resolve(__dirname, CONVOS_DIR, 'two_complex_convos.json')))
    const driver = new BotDriver()
    const compiler = driver.BuildCompiler()
    const decompiledConvos = await new ConvoHandler(compiler)
      .decompileConvos({ crawlerResult, mergeUtterances: true })
    assert.equal(decompiledConvos.scriptObjects.length, 2)
    assert.equal(decompiledConvos.scriptObjects[0].botUtterances.length, 0)
    assert.equal(decompiledConvos.scriptObjects[0].script,
      `test convo 1

#me
meText1

#bot
UTT_M1_BOTTEXT1_BOT

#bot
UTT_M2_BOTTEXT2_BOT

#bot
UTT_M3_BOTTEXT3_BOT

#bot
UTT_M4_BOTTEXT4_BOT

#bot
UTT_M5_BOTTEXT5_BOT

#me
meText2

#bot
UTT_M6_BOTTEXT6_BOT

#bot
UTT_M7_BOTTEXT7_BOT

#bot
UTT_M8_BOTTEXT8_BOT

#bot
UTT_M9_BOTTEXT9_BOT

#bot
UTT_M10_BOTTEXT10_BOT

#bot
UTT_M11_BOTTEXT11_BOT

#bot
UTT_M12_BOTTEXT12_BOT
`
    )
  })
})
