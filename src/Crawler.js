const debug = require('debug')('botium-crawler-crawler')
const { BotDriver } = require('botium-core')
const { getAllValuesByKey } = require('./util')

const EMPTY_ENTRY_POINT = '*empty_entry_point*'
const EMPTY_ENTRY_POINT_NAME = 'EMPTY_ENTRY_POINT'
const DEFAULT_ENTRY_POINTS = ['hello', 'help']

const convos = []
const visitedPath = []

module.exports = class Crawler {
  constructor ({ config, incomprehensions }, callbackValidationError) {
    this.driver = new BotDriver(config && config.Capabilities, config && config.Sources, config && config.Envs)
    this.compiler = this.driver.BuildCompiler()
    this.incomprehensions = incomprehensions
    this.callbackValidationError = callbackValidationError
    this.entryPointId = 0
  }

  async crawl ({ entryPoints = [], hasDefaultWelcomeMessage = false, depth = 5, ignoreSteps = [] }) {
    debug(`A crawler started with '${entryPoints}' entry point and ${depth} depth`)
    if (!Array.isArray(entryPoints)) {
      debug('The entryPoints param has to be an array of strings')
      return convos
    }

    const defaultWelcomeMessage = await this._getDefaultWelcomeMessage(hasDefaultWelcomeMessage)
    if (entryPoints.length === 0) {
      entryPoints = defaultWelcomeMessage || DEFAULT_ENTRY_POINTS
    }

    this.depth = depth
    this.ignoreSteps = ignoreSteps

    await Promise.all(entryPoints.map(async (entryPointText) => {
      return this._makeConversations(entryPointText, Number(convos.length), hasDefaultWelcomeMessage)
    }))

    debug('Crawler finished')
    return convos
  }

  async _makeConversations (entryPointText, entryPointId, hasDefaultWelcomeMessage) {
    if (typeof entryPointText !== 'string') {
      debug('The entryPoints param has to consist of strings')
      return
    }
    convos[entryPointId] = []
    visitedPath[entryPointId] = []

    while (!visitedPath[entryPointId].includes(entryPointText)) {
      await this._start()
      const params = {
        hasDefaultWelcomeMessage,
        depth: 0,
        path: entryPointText,
        entryPointId,
        tempConvo: {
          header: {
            name: entryPointText !== EMPTY_ENTRY_POINT
              ? `${entryPointId}.${convos[entryPointId].length}_${entryPointText}`
              : `${entryPointId}.${convos[entryPointId].length}_${EMPTY_ENTRY_POINT_NAME}`
          },
          conversation: []
        }
      }
      if (entryPointText !== EMPTY_ENTRY_POINT) {
        params.userMessage = {
          sender: 'me',
          messageText: entryPointText
        }
      }
      await this._makeConversation(params)
      await this._stop()
    }
  }

  async _makeConversation ({ userMessage, hasDefaultWelcomeMessage, depth, path, entryPointId, tempConvo }) {
    try {
      if (userMessage) {
        if (depth === 0 && hasDefaultWelcomeMessage) {
          const welcomeMessage = await this.container.WaitBotSays()
          tempConvo.conversation.push(welcomeMessage)
        }
        tempConvo.conversation.push(userMessage)
        await this.container.UserSays(userMessage)
      }
      const answer = await this.container.WaitBotSays()
      tempConvo.conversation.push(answer)

      await this._validateAnswer(answer, userMessage)

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
            !(this.ignoreSteps.includes(button.text) || this.ignoreSteps.includes(button.payload))) {
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
              path: button.payload ? path + button.text + JSON.stringify(button.payload) : path + button.text,
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

  async _validateAnswer (botAnswer, userMessage) {
    // INCOMPREHENSION VALIDATION
    for (const incomprehension of this.incomprehensions) {
      if (this.compiler.Match(botAnswer, incomprehension)) {
        debug('User message is failure to understand by the bot', { userMessage, botAnswer })
        this.callbackValidationError('User message is failure to understand by the bot', { userMessage, botAnswer })
      }
    }
  }

  async _getDefaultWelcomeMessage (hasDefaultWelcomeMessage) {
    let defaultEntryPoints
    await this._start()
    if (hasDefaultWelcomeMessage) {
      try {
        await this.container.WaitBotSays()
      } catch (e) {
        throw new Error('This chat bot hasn\'t got default welcome message. ' +
          'Please set \'hasDefaultWelcomeMessage\' to false.')
      }
      defaultEntryPoints = [EMPTY_ENTRY_POINT]
    } else {
      let hasDefault = true
      try {
        await this.container.WaitBotSays()
      } catch (e) {
        hasDefault = false
      }
      if (hasDefault) {
        throw new Error('This chat bot has got default welcome message. ' +
          'Please set \'hasDefaultWelcomeMessage\' to true.')
      }
    }
    await this._stop()
    return defaultEntryPoints
  }
}
