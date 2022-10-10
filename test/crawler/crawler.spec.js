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
    const convoResult = await crawler.crawl({ entryPoints: ['Fruits'] })
    const flatConvos = _.flatten(convoResult.convos)
    assert.equal(flatConvos.length, 6)
    assert.equal(flatConvos[0].header.name, 'FRUITS_Convo_1')
    assert.equal(flatConvos[0].conversation.length, 6)
    assert.isTrue(flatConvos[0].stucked)
    assert.equal(flatConvos[0].path, 'Fruits;Apple{"name":"Apple"};Red')
  })

  it('Test simple echo bot with depth', async function () {
    process.env.BOTIUM_CONFIG = path.resolve(__dirname, CONFIG_DIR, 'fruits.json')
    const driver = new BotDriver()
    const crawler = new Crawler({ driver })
    const convoResult = await crawler.crawl({ entryPoints: ['Fruits'], depth: 3 })
    const flatConvos = _.flatten(convoResult.convos)
    assert.equal(flatConvos.length, 4)
    assert.equal(flatConvos[0].header.name, 'FRUITS_Convo_1')
    assert.equal(flatConvos[0].conversation.length, 6)
    assert.equal(flatConvos[0].path, 'Fruits;Apple{"name":"Apple"};Red')
  })

  it('Test simple echo bot with waitForPrompt', async function () {
    process.env.BOTIUM_CONFIG = path.resolve(__dirname, CONFIG_DIR, 'fruits.json')
    const driver = new BotDriver()
    const crawler = new Crawler({ driver })
    const convoResult = await crawler.crawl({ entryPoints: ['Fruits'], waitForPrompt: 100 })
    const flatConvos = _.flatten(convoResult.convos)
    assert.equal(flatConvos.length, 6)
    assert.equal(flatConvos[0].header.name, 'FRUITS_Convo_1')
    assert.equal(flatConvos[0].conversation.length, 6)
    assert.isTrue(flatConvos[0].stucked)
    assert.equal(flatConvos[0].path, 'Fruits;Apple{"name":"Apple"};Red')
  }).timeout(10000)

  it('Test simple echo bot with exitCriteria for text', async function () {
    process.env.BOTIUM_CONFIG = path.resolve(__dirname, CONFIG_DIR, 'fruits.json')
    const driver = new BotDriver()
    const crawler = new Crawler({ driver })
    const convoResult = await crawler.crawl({ entryPoints: ['Fruits'], exitCriteria: ['Gree'] })
    const flatConvos = _.flatten(convoResult.convos)
    assert.equal(flatConvos.length, 2)
    assert.equal(flatConvos[0].header.name, 'FRUITS_Convo_1')
    assert.equal(flatConvos[0].conversation.length, 4)
    assert.isTrue(flatConvos[0].exitCriteriaMatch)
    assert.equal(flatConvos[0].path, 'Fruits;Apple{"name":"Apple"}')
  })

  it('Test simple echo bot with ignoreButtons for payload', async function () {
    process.env.BOTIUM_CONFIG = path.resolve(__dirname, CONFIG_DIR, 'fruits.json')
    const driver = new BotDriver()
    const crawler = new Crawler({ driver })
    const convoResult = await crawler.crawl({ entryPoints: ['Fruits'], ignoreButtons: ['{"name":"Apple"}'] })
    const flatConvos = _.flatten(convoResult.convos)
    assert.equal(flatConvos.length, 3)
    assert.equal(flatConvos[0].header.name, 'FRUITS_Convo_1')
    assert.equal(flatConvos[0].conversation.length, 8)
    assert.equal(flatConvos[0].path, 'Fruits;Pear{"name":"Pear"};Green;Give me a green apple')
  })

  it('Stop conversation at first step', async function () {
    process.env.BOTIUM_CONFIG = path.resolve(__dirname, CONFIG_DIR, 'fruits.json')
    const driver = new BotDriver()
    const crawler = new Crawler({ driver })
    const convoResult = await crawler.crawl({ entryPoints: ['Hello'] })
    const flatConvos = _.flatten(convoResult.convos)
    assert.equal(flatConvos.length, 1)
    assert.equal(flatConvos[0].header.name, 'HELLO_Convo_1')
    assert.equal(flatConvos[0].conversation.length, 2)
    assert.equal(flatConvos[0].err, 'Conversation stopped at the first conversation step, because no buttons or quick replies are found so far. Please check the execution settings in the configuration menu.')
    assert.equal(flatConvos[0].path, 'Hello')
  })

  it('Welcome message', async function () {
    process.env.BOTIUM_CONFIG = path.resolve(__dirname, CONFIG_DIR, 'fruits.json')
    const driver = new BotDriver()
    const crawler = new Crawler({ driver })
    const crawlerResult = await crawler.crawl({ numberOfWelcomeMessages: 1 })
    assert.equal(crawlerResult.err,
      'This chat bot has less welcome message than 1.\nPlease set \'numberOfWelcomeMessages\' to the correct number of welcome messages.')
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
    const convoResult = await crawler.crawl({ entryPoints: ['Hello'], userAnswers })
    const flatConvos = _.flatten(convoResult.convos)
    assert.equal(flatConvos.length, 1)
    assert.equal(flatConvos[0].header.name, 'HELLO_Convo_1')
    assert.equal(flatConvos[0].conversation.length, 4)
    assert.isTrue(flatConvos[0].stucked)
    assert.equal(flatConvos[0].path, 'Hello;Test answer')
  })

  it('Test simple echo bot with end of conversation', async function () {
    process.env.BOTIUM_CONFIG = path.resolve(__dirname, CONFIG_DIR, 'fruits.json')
    const endOfConversations = ['Fruits;Apple{"name":"Apple"}']
    const driver = new BotDriver()
    const crawler = new Crawler({ driver })
    const convoResult = await crawler.crawl({ entryPoints: ['Fruits'], endOfConversations })
    const flatConvos = _.flatten(convoResult.convos)
    assert.equal(flatConvos.length, 4)
    assert.equal(flatConvos[0].header.name, 'FRUITS_Convo_1')
    assert.equal(flatConvos[0].conversation.length, 4)
    assert.equal(flatConvos[0].path, 'Fruits;Apple{"name":"Apple"}')
  })

  it('Test with simple echo bot with url button', async function () {
    process.env.BOTIUM_CONFIG = path.resolve(__dirname, CONFIG_DIR, 'urlTest.json')
    const driver = new BotDriver()
    const crawler = new Crawler({ driver })
    const convoResult = await crawler.crawl({ entryPoints: ['Give me url buttons'] })
    const flatConvos = _.flatten(convoResult.convos)
    assert.equal(flatConvos.length, 1)
    assert.equal(flatConvos[0].header.name, 'GIVE_ME_URL_BUTT_Convo_1')
    assert.equal(flatConvos[0].conversation.length, 4)
    assert.isTrue(flatConvos[0].stucked)
  })
})
