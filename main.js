const debug = require('debug')('botium-crawler-main')
// const config = require('./config-echo-fruit.json')
const config = require('./config-directline.json')
const Crawler = require('./src/Crawler')
const ConvoHandler = require('./src/ConvoHandler')

// const ENTRY_POINTS = ['Fruits', 'Apple']
// const IGNORE_BUTTONS = ['Red']
const ENTRY_POINTS = ['help']
const IGNORE_BUTTONS = ['card broken:lang']
const OUT_DIR = 'Convos'
const DEPTH = 4

const main = async () => {
  debug('--- Botium-Crawler ---')
  try {
    const crawler = new Crawler(config)
    const convos = await crawler.crawl(ENTRY_POINTS, DEPTH, IGNORE_BUTTONS)

    const convoHandler = new ConvoHandler(crawler.driver)
    await convoHandler.logConvosOnConsole(convos)
    await convoHandler.persistConvosInFiles(convos, OUT_DIR)
  } catch (e) {
    console.log(e)
    debug('Botium-Crawler failed: ', e)
  }
}

main().then(() => debug('Botium-Crawler finished successfully'))
