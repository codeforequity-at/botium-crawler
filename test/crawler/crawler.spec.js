const path = require('path')
const _ = require('lodash')
const assert = require('chai').assert
const Crawler = require('../../src/Crawler')
const { BotDriver } = require('botium-core')
const CONFIG_DIR = 'config'

describe('Crawler test', function () {
  it('Test with simple echo bot', async function () {
    process.env.BOTIUM_CONFIG = path.resolve(__dirname, CONFIG_DIR, 'fruits.json')
    const driver = new BotDriver()
    const crawler = new Crawler({ driver })
    const convos = await crawler.crawl({ entryPoints: ['Fruits'] })
    const flatConvos = _.flatten(convos)
    assert.equal(flatConvos.length, 6)
    assert.equal(flatConvos[0].header.name, '1.1.1_Fruits_Apple')
    assert.equal(flatConvos[0].conversation.length, 6)
    assert.isTrue(flatConvos[0].stucked)
    assert.equal(flatConvos[0].path, 'Fruits;Apple{"name":"Apple"};Red')
  })

  it('Test simple echo bot with depth', async function () {
    process.env.BOTIUM_CONFIG = path.resolve(__dirname, CONFIG_DIR, 'fruits.json')
    const driver = new BotDriver()
    const crawler = new Crawler({ driver })
    const convos = await crawler.crawl({ entryPoints: ['Fruits'], depth: 3 })
    const flatConvos = _.flatten(convos)
    assert.equal(flatConvos.length, 4)
    assert.equal(flatConvos[0].header.name, '1.1.1_Fruits_Apple')
    assert.equal(flatConvos[0].conversation.length, 6)
    assert.equal(flatConvos[0].path, 'Fruits;Apple{"name":"Apple"};Red')
  })

  it('Test simple echo bot with waitForPrompt', async function () {
    process.env.BOTIUM_CONFIG = path.resolve(__dirname, CONFIG_DIR, 'fruits.json')
    const driver = new BotDriver()
    const crawler = new Crawler({ driver })
    const convos = await crawler.crawl({ entryPoints: ['Fruits'], waitForPrompt: 100 })
    const flatConvos = _.flatten(convos)
    assert.equal(flatConvos.length, 6)
    assert.equal(flatConvos[0].header.name, '1.1.1_Fruits_Apple')
    assert.equal(flatConvos[0].conversation.length, 6)
    assert.isTrue(flatConvos[0].stucked)
    assert.equal(flatConvos[0].path, 'Fruits;Apple{"name":"Apple"};Red')
  }).timeout(10000)

  it('Test simple echo bot with exitCriteria for text', async function () {
    process.env.BOTIUM_CONFIG = path.resolve(__dirname, CONFIG_DIR, 'fruits.json')
    const driver = new BotDriver()
    const crawler = new Crawler({ driver })
    const convos = await crawler.crawl({ entryPoints: ['Fruits'], exitCriteria: ['Gree'] })
    const flatConvos = _.flatten(convos)
    assert.equal(flatConvos.length, 4)
    assert.equal(flatConvos[0].header.name, '1.1.1_Fruits_Apple')
    assert.equal(flatConvos[0].conversation.length, 6)
    assert.isTrue(flatConvos[0].stucked)
    assert.equal(flatConvos[0].path, 'Fruits;Apple{"name":"Apple"};Red')
  })

  it('Test simple echo bot with exitCriteria for payload', async function () {
    process.env.BOTIUM_CONFIG = path.resolve(__dirname, CONFIG_DIR, 'fruits.json')
    const driver = new BotDriver()
    const crawler = new Crawler({ driver })
    const convos = await crawler.crawl({ entryPoints: ['Fruits'], exitCriteria: ['{"name":"Apple"}'] })
    const flatConvos = _.flatten(convos)
    assert.equal(flatConvos.length, 4)
    assert.equal(flatConvos[0].header.name, '1.1_Fruits_Apple')
    assert.equal(flatConvos[0].conversation.length, 2)
    assert.equal(flatConvos[0].path, 'Fruits;Apple{"name":"Apple"}')
  })

  it('Stop conversation at first step', async function () {
    process.env.BOTIUM_CONFIG = path.resolve(__dirname, CONFIG_DIR, 'fruits.json')
    const driver = new BotDriver()
    const crawler = new Crawler({ driver })
    const convos = await crawler.crawl({ entryPoints: ['Hello'] })
    const flatConvos = _.flatten(convos)
    assert.equal(flatConvos.length, 1)
    assert.equal(flatConvos[0].header.name, '1_Hello')
    assert.equal(flatConvos[0].conversation.length, 2)
    assert.equal(flatConvos[0].err, 'Conversation stopped at the first conversation step.')
    assert.equal(flatConvos[0].path, 'Hello')
  })

  it('Welcome message', async function () {
    process.env.BOTIUM_CONFIG = path.resolve(__dirname, CONFIG_DIR, 'fruits.json')
    const driver = new BotDriver()
    const crawler = new Crawler({ driver })
    try {
      await crawler.crawl({ numberOfWelcomeMessages: 1 })
      assert.fail('expected error')
    } catch (err) {
      assert.equal(err.message,
        'This chat bot has less welcome message than 1.\nPlease set \'numberOfWelcomeMessages\' to the correct number of welcome messages.')
    }
  })

  it('Test simple echo bot with userAnswers', async function () {
    process.env.BOTIUM_CONFIG = path.resolve(__dirname, CONFIG_DIR, 'fruits.json')
    const userAnswers = [
      {
        path: 'Hello',
        answers: ['Test answer']
      }
    ]
    const driver = new BotDriver()
    const crawler = new Crawler({ driver })
    const convos = await crawler.crawl({ entryPoints: ['Hello'], userAnswers })
    const flatConvos = _.flatten(convos)
    assert.equal(flatConvos.length, 1)
    assert.equal(flatConvos[0].header.name, '1.1_Hello_Test answer')
    assert.equal(flatConvos[0].conversation.length, 4)
    assert.isTrue(flatConvos[0].stucked)
    assert.equal(flatConvos[0].path, 'Hello;Test answer')
  })
})
