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

  async crawl (entryPoints, depth = 5, ignoreButtons = []) {
    debug(`A crawler started with '${entryPoints}' entry point and ${depth} depth`)
    if (!Array.isArray(entryPoints)) {
      debug('The entryPoints param has be an array of strings')
      return convos
    }
    this.depth = depth
    this.ignoreButtons = ignoreButtons

    for (let i = 0; i < entryPoints.length; i++) {
      const entryPointText = entryPoints[i]
      if (typeof entryPointText !== 'string') {
        debug('The entryPoints param has to consist of strings')
        break
      }
      const entryPoint = {
        sender: 'me',
        messageText: entryPointText
      }

      convos[i] = []
      visitedPath[i] = []

      while (!visitedPath[i].includes(entryPoint.messageText)) {
        await this._start()

        tempConvo = {
          header: {
            name: `${i}.${convos[i].length}_${entryPoint.messageText}`
          },
          conversation: []
        }

        await this._makeConversation(entryPoint, 0, entryPoint.messageText, i)

        await this._stop()
      }
    }

    debug('Crawler finished')
    return convos
  }

  async _makeConversation (userMessage, depth, path, entryPointId) {
    try {
      tempConvo.conversation.push(userMessage)
      await this.container.UserSays(userMessage)
      const answer = await this.container.WaitBotSays()
      tempConvo.conversation.push(answer)

      const buttons = getAllValuesByKey(answer)
      if (depth >= this.depth || (buttons.length === 0 && !visitedPath[entryPointId].includes(path))) {
        debug(`Conversation successfully end on '${path}' path`)
        convos[entryPointId].push(tempConvo)
        visitedPath[entryPointId].push(path)
        return
      }

      if (buttons) {
        for (const button of buttons) {
          if (!visitedPath[entryPointId].includes(path + button.text) &&
            !(this.ignoreButtons.includes(button.text) || this.ignoreButtons.includes(button.payload))) {
            if (depth === 0) {
              tempConvo.header.name = `${tempConvo.header.name}_${button.text}`
            }
            await this._makeConversation({
              sender: 'me',
              messageText: button.text,
              buttons: [button]
            }, depth + 1, path + button.text, entryPointId)
            return
          }
        }

        visitedPath[entryPointId].push(path)
      }
    } catch (e) {
      visitedPath[entryPointId].push(path)
      debug(`Conversation failed on '${path}' path with the following user message: `, userMessage)
      debug('error: ', e)
    }
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
}
