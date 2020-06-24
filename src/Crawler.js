const debug = require('debug')('botium-crawler-crawler')
const { BotDriver } = require('botium-core')
const { getAllValuesByKey } = require('./util')

const convos = []
const visitedPath = []

module.exports = class Crawler {
  constructor (args, callbackValidationError) {
    this.driver = new BotDriver(args && args.caps, args && args.sources, args && args.envs)
    this.callbackValidationError = callbackValidationError
    this.entryPointId = 0
  }

  async crawl (entryPoints, depth = 5, ignoreButtons = []) {
    debug(`A crawler started with '${entryPoints}' entry point and ${depth} depth`)
    if (!Array.isArray(entryPoints)) {
      debug('The entryPoints param has be an array of strings')
      return convos
    }
    this.depth = depth
    this.ignoreButtons = ignoreButtons

    await Promise.all(entryPoints.map(async (entryPointText) => {
      return this._makeConversations(entryPointText, Number(convos.length))
    }))

    debug('Crawler finished')
    return convos
  }

  async _makeConversations (entryPointText, entryPointId) {
    if (typeof entryPointText !== 'string') {
      debug('The entryPoints param has to consist of strings')
      return
    }
    const entryPoint = {
      sender: 'me',
      messageText: entryPointText
    }

    convos[entryPointId] = []
    visitedPath[entryPointId] = []

    while (!visitedPath[entryPointId].includes(entryPoint.messageText)) {
      await this._start()
      const params = {
        userMessage: entryPoint,
        depth: 0,
        path: entryPoint.messageText,
        entryPointId,
        tempConvo: {
          header: {
            name: `${entryPointId}.${convos[entryPointId].length}_${entryPoint.messageText}`
          },
          conversation: []
        }
      }
      await this._makeConversation(params)
      await this._stop()
    }
  }

  async _makeConversation ({ userMessage, depth, path, entryPointId, tempConvo }) {
    try {
      tempConvo.conversation.push(userMessage)
      await this.container.UserSays(userMessage)
      const answer = await this.container.WaitBotSays()
      tempConvo.conversation.push(answer)

      const buttons = getAllValuesByKey(answer)
      if (depth >= this.depth || (buttons.length === 0 && !visitedPath[entryPointId].includes(path))) {
        debug(`Conversation successfully end on '${path}' path`)
        convos[entryPointId].push(Object.assign({}, tempConvo))
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

            const params = {
              userMessage: {
                sender: 'me',
                messageText: button.text,
                buttons: [button]
              },
              depth: depth + 1,
              path: path + button.text,
              entryPointId,
              tempConvo
            }
            await this._makeConversation(params)

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
