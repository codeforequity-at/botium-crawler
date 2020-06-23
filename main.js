const debug = require('debug')('botium-crawler-main')
const config = require('./config-echo-fruit.json')
const Crawler = require('./src/Crawler')
const ConvoHandler = require('./src/ConvoHandler')

const ENTRY_POINT = 'Fruits'
const OUT_DIR = 'Convos'
const DEPTH = 4

const main = async () => {
  debug('--- Botium-Crawler ---')
  try {
    const crawler = new Crawler(config)
    const convos = await crawler.crawl(ENTRY_POINT, DEPTH)

    const convoHandler = new ConvoHandler(crawler.driver)
    await convoHandler.logConvosOnConsole(convos)
    await convoHandler.persistConvosInFiles(convos, OUT_DIR)
  } catch (e) {
    console.log(e)
    debug('Botium-Crawler failed: ', e)
  }
}

main().then(() => debug('Botium-Crawler finished successfully'))
