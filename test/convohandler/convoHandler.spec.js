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
UTT_1_bot
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
UTT_1_bot
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
UTT_M_1_bot
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
UTT_M_1_bot

#bot
UTT_M_2_bot

#bot
UTT_M_3_bot

#bot
UTT_M_4_bot

#bot
UTT_M_5_bot

#me
meText2

#bot
UTT_M_6_bot

#bot
UTT_M_7_bot

#bot
UTT_M_8_bot

#bot
UTT_M_9_bot

#bot
UTT_M_10_bot

#bot
UTT_M_11_bot

#bot
UTT_M_12_bot
`
    )
  })
})
