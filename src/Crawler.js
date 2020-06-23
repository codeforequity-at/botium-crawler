const debug = require('debug')('botium-crawler-crawler')
const { BotDriver } = require('botium-core')
const { getAllValuesByKey } = require('./util')

const convos = []
const visitedPath = []
let tempConvo = {}

module.exports = class Crawler {
  constructor (args) {
    this.driver = new BotDriver(args && args.caps, args && args.sources, args && args.envs)
  }

  async crawl (entryPointText, depth) {
    debug(`A crawler started with '${entryPointText}' entry point and ${depth} depth`)

    if (typeof entryPointText !== 'string') {
      debug('The entry point need to be string')
      return convos
    }
    const entryPoint = {
      sender: 'me',
      messageText: entryPointText
    }
    this.depth = depth

    while (!visitedPath.includes(entryPoint.messageText)) {
      await this._start()

      tempConvo = {
        header: {
          name: `generated ${convos.length}`
        },
        conversation: []
      }

      await this._makeConversation(entryPoint, 0, entryPoint.messageText)

      await this._stop()
    }

    debug(`Crawler finished with ${convos.length} convos`)
    return convos
  }

  async _start () {
    const myContainer = await this.driver.Build()
    debug('Conversation container built, now starting')
    try {
      await myContainer.Start()
      debug('Conversation container started.')
      this.container = myContainer
    } catch (err) {
      try {
        await myContainer.Stop()
      } catch (err) {
        debug(`Conversation Stop failed: ${err}`)
      }
      try {
        await myContainer.Clean()
      } catch (err) {
        debug(`Conversation Clean failed: ${err}`)
      }
      throw err
    }
  }

  async _stop () {
    if (this.container) {
      try {
        await this.container.Stop()
      } catch (err) {
        debug(`Conversation Stop failed: ${err}`)
      }
      try {
        await this.container.Clean()
      } catch (err) {
        debug(`Conversation Clean failed: ${err}`)
      }
    }
    debug('Conversation container stopped.')
  }

  async _makeConversation (userMessage, depth, path) {
    try {
      tempConvo.conversation.push(userMessage)
      await this.container.UserSays(userMessage)
      const answer = await this.container.WaitBotSays()
      tempConvo.conversation.push(answer)

      const buttons = getAllValuesByKey(answer)
      if (depth >= this.depth || (buttons.length === 0 && !visitedPath.includes(path))) {
        debug(`Conversation successfully end on '${path}' path`)
        convos.push(tempConvo)
        visitedPath.push(path)
        return
      }

      if (buttons) {
        for (const button of buttons) {
          if (!visitedPath.includes(path + button.text)) {
            await this._makeConversation({
              sender: 'me',
              messageText: button.text,
              buttons: [button]
            }, depth + 1, path + button.text)
            return
          }
        }

        visitedPath.push(path)
      }
    } catch (e) {
      visitedPath.push(path)
      debug(`Conversation failed on '${path}' path with the following user message: `, userMessage)
      debug('error: ', e)
    }
  }
}
