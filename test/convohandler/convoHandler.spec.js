const fs = require('fs')
const path = require('path')
const assert = require('chai').assert
const ConvoHandler = require('../../src/ConvoHandler')
const { BotDriver } = require('botium-core')
const CONVOS_DIR = 'convos'

describe('ConvoHandler test', function () {
  it('decompile one simple convo without utterances', async function () {
    const crawlerResult = {
      err: 'error'
    }
    crawlerResult.convos = JSON.parse(fs.readFileSync(path.resolve(__dirname, CONVOS_DIR, 'one_simple_convo.json')))
    const driver = new BotDriver()
    const compiler = driver.BuildCompiler()
    const decompiledConvos = await new ConvoHandler(compiler)
      .decompileConvos({ crawlerResult, generateUtterances: false, mergeUtterances: false })
    assert.equal(decompiledConvos.err, 'error')
    assert.equal(decompiledConvos.scriptObjects.length, 1)
    assert.equal(decompiledConvos.scriptObjects[0].botUtterances.length, 0)
    assert.equal(decompiledConvos.scriptObjects[0].script,
      `test convo

#me
meText

#bot
botText
`
    )
  })

  it('decompile one simple convo with utterances', async function () {
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
UTT_bot_1_BOTTEXT
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
    assert.equal(decompiledConvos.scriptObjects[0].botUtterances.length, 2)
    assert.equal(decompiledConvos.scriptObjects[0].script,
      `test convo 1

#me
meText

#bot
UTT_bot_1_BOTTEXT

#bot
UTT_bot_2_BOTTEXT(BOT
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
UTT_SHARED_bot_1_BOTTEXT

#bot
UTT_SHARED_bot_2_BOTTEXT(BOT
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
UTT_SHARED_bot_1_BOTTEXT1

#bot
UTT_SHARED_bot_2_BOTTEXT2

#bot
UTT_SHARED_bot_3_BOTTEXT3

#bot
UTT_SHARED_bot_4_BOTTEXT4

#bot
UTT_SHARED_bot_5_BOTTEXT5

#me
meText2

#bot
UTT_SHARED_bot_6_BOTTEXT6

#bot
UTT_SHARED_bot_7_BOTTEXT7

#bot
UTT_SHARED_bot_8_BOTTEXT8

#bot
UTT_SHARED_bot_9_BOTTEXT9

#bot
UTT_SHARED_bot_10_BOTTEXT10

#bot
UTT_SHARED_bot_11_BOTTEXT11

#bot
UTT_SHARED_bot_12_BOTTEXT12
`
    )
  })
})
