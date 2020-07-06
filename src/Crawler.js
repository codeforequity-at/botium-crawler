const debug = require('debug')('botium-crawler-crawler')
const { BotDriver } = require('botium-core')
const { getAllValuesByKeyFromObjects } = require('./util')

const WELCOME_MESSAGE_ENTRY_POINT = '*welcome_message_entry_point*'
const WELCOME_MESSAGE_ENTRY_POINT_NAME = 'WELCOME_MESSAGE'
const DEFAULT_ENTRY_POINTS = ['hello', 'help']

module.exports = class Crawler {
  constructor ({ config, incomprehensions }, callbackValidationError) {
    this.driver = new BotDriver(config && config.Capabilities, config && config.Sources, config && config.Envs)
    this.compiler = this.driver.BuildCompiler()
    this.containers = {}
    this.incomprehensions = incomprehensions
    this.callbackValidationError = callbackValidationError
    this.entryPointId = 0
    this.convos = []
    this.visitedPath = []
  }

  async crawl ({ entryPoints = [], numberOfWelcomeMessages = 0, depth = 5, ignoreSteps = [] }) {
    debug(`A crawler started with '${entryPoints}' entry point and ${depth} depth`)
    if (!Array.isArray(entryPoints)) {
      debug('The entryPoints param has to be an array of strings')
      return this.convos
    }

    const welcomeMessageEntryPoint = await this._validateNumberOfWelcomeMessage(numberOfWelcomeMessages)
    if (entryPoints.length === 0) {
      entryPoints = welcomeMessageEntryPoint || DEFAULT_ENTRY_POINTS
    }

    this.depth = depth
    this.ignoreSteps = ignoreSteps
    let entryPointId = 0
    await Promise.all(entryPoints.map(async (entryPointText) => {
      return this._makeConversations(entryPointText, entryPointId++, numberOfWelcomeMessages)
    }))

    debug('Crawler finished')
    return this.convos
  }

  async _makeConversations (entryPointText, entryPointId, numberOfWelcomeMessages) {
    if (typeof entryPointText !== 'string') {
      debug('The entryPoints param has to consist of strings')
      return
    }
    this.convos[entryPointId] = []
    this.visitedPath[entryPointId] = []

    while (!this.visitedPath[entryPointId].includes(entryPointText)) {
      await this._start(entryPointId)
      const params = {
        numberOfWelcomeMessages,
        depth: 0,
        path: entryPointText,
        entryPointId,
        tempConvo: {
          header: {
            name: entryPointText !== WELCOME_MESSAGE_ENTRY_POINT
              ? `${entryPointId}.${this.convos[entryPointId].length}_${entryPointText}`
              : `${entryPointId}.${this.convos[entryPointId].length}_${WELCOME_MESSAGE_ENTRY_POINT_NAME}`
          },
          conversation: []
        }
      }
      if (entryPointText !== WELCOME_MESSAGE_ENTRY_POINT) {
        params.userMessage = {
          sender: 'me',
          messageText: entryPointText
        }
      }
      await this._makeConversation(params)
      await this._stop(entryPointId)
    }
  }

  async _makeConversation ({ userMessage, numberOfWelcomeMessages, depth, path, entryPointId, tempConvo }) {
    try {
      const answers = []
      if (userMessage) {
        if (depth === 0 && numberOfWelcomeMessages > 0) {
          for (let i = 0; i < numberOfWelcomeMessages; i++) {
            tempConvo.conversation.push(await this.containers[entryPointId].WaitBotSays())
          }
        }
        tempConvo.conversation.push(userMessage)
        await this.containers[entryPointId].UserSays(userMessage)
        answers.push(await this.containers[entryPointId].WaitBotSays())
      } else {
        for (let i = 0; i < numberOfWelcomeMessages; i++) {
          answers.push(await this.containers[entryPointId].WaitBotSays())
        }
      }

      tempConvo.conversation.push(...answers)
      await this._validateAnswers(answers, userMessage)

      const buttons = getAllValuesByKeyFromObjects(answers)
      if (depth >= this.depth || (buttons.length === 0 && !this.visitedPath[entryPointId].includes(path))) {
        debug(`Conversation successfully end on '${path}' path`)
        this.convos[entryPointId].push(Object.assign({}, tempConvo))
        this.visitedPath[entryPointId].push(path)
        return
      }

      if (buttons) {
        for (const button of buttons) {
          const buttonPath = button.payload ? path + button.text + JSON.stringify(button.payload) : path + button.text
          if (!this.visitedPath[entryPointId].includes(buttonPath) &&
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
              path: buttonPath,
              entryPointId,
              tempConvo
            }
            await this._makeConversation(params)

            return
          }
        }

        this.visitedPath[entryPointId].push(path)
      }
    } catch (e) {
      this.visitedPath[entryPointId].push(path)
      debug(`Conversation failed on '${path}' path with the following user message: `, userMessage)
      debug('error: ', e)
    }
  }

  async _start (entryPointId) {
    const myContainer = await this.driver.Build()
    debug('Conversation container built, now starting')
    try {
      await myContainer.Start()
      debug('Conversation container started.')
      this.containers[entryPointId] = myContainer
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

  async _stop (entryPointId) {
    if (this.containers[entryPointId]) {
      try {
        await this.containers[entryPointId].Stop()
      } catch (err) {
        debug(`Conversation Stop failed: ${err}`)
      }
      try {
        await this.containers[entryPointId].Clean()
      } catch (err) {
        debug(`Conversation Clean failed: ${err}`)
      }
    }
    debug('Conversation container stopped.')
  }

  async _validateAnswers (botAnswers, userMessage) {
    // INCOMPREHENSION VALIDATION
    for (const incomprehension of this.incomprehensions) {
      for (const botAnswer of botAnswers) {
        if (this.compiler.Match(botAnswer, incomprehension)) {
          debug('User message is failure to understand by the bot', {
            userMessage,
            botAnswer
          })
          this.callbackValidationError('User message is failure to understand by the bot', {
            userMessage,
            botAnswer
          })
        }
      }
    }
  }

  async _validateNumberOfWelcomeMessage (numberOfWelcomeMessages, entryPointId = 'general') {
    let welcomeMessageEntryPoint
    await this._start(entryPointId)
    if (numberOfWelcomeMessages > 0) {
      for (let i = 0; i < numberOfWelcomeMessages; i++) {
        try {
          await this.containers[entryPointId].WaitBotSays()
        } catch (e) {
          throw new Error(`This chat bot has less welcome message than ${numberOfWelcomeMessages}.
            Please set 'numberOfWelcomeMessages' to the correct number of welcome messages..`)
        }
      }
      let hasCorrectNumberOfWelcomeMessage = false
      try {
        await this.containers[entryPointId].WaitBotSays()
      } catch (e) {
        hasCorrectNumberOfWelcomeMessage = true
        welcomeMessageEntryPoint = [WELCOME_MESSAGE_ENTRY_POINT]
      }
      if (!hasCorrectNumberOfWelcomeMessage) {
        throw new Error(`This chat bot has more welcome message than ${numberOfWelcomeMessages}.
            Please set 'numberOfWelcomeMessages' to the correct number of welcome messages..`)
      }
    } else {
      let hasDefaultWelcomeMessage = true
      try {
        await this.containers[entryPointId].WaitBotSays()
      } catch (e) {
        hasDefaultWelcomeMessage = false
      }
      if (hasDefaultWelcomeMessage) {
        throw new Error(`This chat bot has more welcome message than ${numberOfWelcomeMessages}.
            Please set 'numberOfWelcomeMessages' to the correct number of welcome messages..`)
      }
    }
    await this._stop(entryPointId)
    return welcomeMessageEntryPoint
  }
}
