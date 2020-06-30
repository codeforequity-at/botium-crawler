const path = require('path')
const debug = require('debug')('botium-crawler-main')
const config = require('./samples/config-echo-fruit.json')
const Crawler = require('./src/Crawler')
const ConvoHandler = require('./src/ConvoHandler')
const { validationErrorHandler } = require('./src/util')

const ENTRY_POINTS = ['Fruits', 'Apple', 'Pear']
const IGNORE_STEPS = ['Red']
const INCOMPREHENSIONS = ['Unknown command']
const OUT_DIR = path.join(__dirname, 'generated')
const DEPTH = 4

const main = async () => {
  debug('--- Botium-Crawler ---')
  try {
    const crawler = new Crawler({ config: config.botium, incomprehensions: INCOMPREHENSIONS }, validationErrorHandler)
    const convos = await crawler.crawl({
      entryPoints: ENTRY_POINTS,
      depth: DEPTH,
      hasDefaultWelcomeMessage: false,
      ignoreSteps: IGNORE_STEPS
    })

    await new ConvoHandler(crawler.compiler).persistConvosInFiles(convos, OUT_DIR)
  } catch (e) {
    debug('Botium-Crawler failed: ', e)
  }
}

main().then(() => debug('Botium-Crawler finished successfully'))
