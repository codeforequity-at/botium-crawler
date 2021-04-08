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
    assert.equal(flatConvos[0].path, 'Fruits;Apple;Red')
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
    assert.equal(flatConvos[0].path, 'Fruits;Apple;Red')
  }).timeout(10000)

  it('Test simple echo bot with exitCriteria', async function () {
    process.env.BOTIUM_CONFIG = path.resolve(__dirname, CONFIG_DIR, 'fruits.json')
    const driver = new BotDriver()
    const crawler = new Crawler({ driver })
    const convos = await crawler.crawl({ entryPoints: ['Fruits'], exitCriteria: ['Green'] })
    const flatConvos = _.flatten(convos)
    assert.equal(flatConvos.length, 4)
    assert.equal(flatConvos[0].header.name, '1.1.1_Fruits_Apple')
    assert.equal(flatConvos[0].conversation.length, 6)
    assert.isTrue(flatConvos[0].stucked)
    assert.equal(flatConvos[0].path, 'Fruits;Apple;Red')
  })
})
