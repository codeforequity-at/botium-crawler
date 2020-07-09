const _ = require('lodash')
const debug = require('debug')('botium-crawler-crawler')
const { BotDriver } = require('botium-core')
const { getAllValuesByKeyFromObjects } = require('./util')

const WELCOME_MESSAGE_ENTRY_POINT = '*welcome_message_entry_point*'
const WELCOME_MESSAGE_ENTRY_POINT_NAME = 'WELCOME_MESSAGE'
const DEFAULT_ENTRY_POINTS = ['hello', 'help']

module.exports = class Crawler {
  constructor ({ config, incomprehensions }, callbackValidationError, callbackAskUser) {
    this.driver = new BotDriver(config && config.Capabilities, config && config.Sources, config && config.Envs)
    this.compiler = this.driver.BuildCompiler()
    this.containers = {}
    this.incomprehensions = incomprehensions
    this.callbackValidationError = callbackValidationError
    this.callbackAskUser = callbackAskUser
    this.entryPointId = 0
    this.convos = []
    this.visitedPath = []
    this.stuckConversations = []
    this.userRequests = []
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
    this.stuckConversations[entryPointId] = []
    this.userRequests[entryPointId] = []
    let firstTry = true

    while (firstTry || this.stuckConversations[entryPointId].length > 0) {
      firstTry = false
      if (this.callbackAskUser && this.stuckConversations[entryPointId].length > 0) {
        _.remove(this.stuckConversations[entryPointId], stuckConversation => !stuckConversation.convo)
        const userResponses = await this.callbackAskUser(this.stuckConversations[entryPointId], this)

        for (const userResponse of userResponses) {
          if (userResponse.texts && userResponse.texts.length > 0) {
            this.userRequests[entryPointId].push(userResponse)
          } else {
            const stuckConversation = _.find(this.stuckConversations[entryPointId],
              stuckConversation => stuckConversation.path === userResponse.path)
            this._finishConversation(stuckConversation.convo, entryPointId, userResponse.path)
            debug(`Conversation successfully ended by user on '${userResponse.path}' path`)
          }
        }
        this.stuckConversations[entryPointId] = []
      }

      while (!this.visitedPath[entryPointId].includes(entryPointText) &&
      !_.some(this.stuckConversations[entryPointId], stuckConversation => stuckConversation.path === entryPointText)) {
        await this._start(entryPointId)
        const params = {
          numberOfWelcomeMessages,
          depth: 0,
          path: entryPointText,
          entryPointId,
          tempConvo: {
            header: {
              name: entryPointText !== WELCOME_MESSAGE_ENTRY_POINT
                ? entryPointText.substring(0, 16)
                : WELCOME_MESSAGE_ENTRY_POINT_NAME
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
  }

  async _makeConversation ({ userMessage, numberOfWelcomeMessages, depth, path, entryPointId, tempConvo }) {
    try {
      const botAnswers = []
      if (userMessage) {
        if (depth === 0 && numberOfWelcomeMessages > 0) {
          for (let i = 0; i < numberOfWelcomeMessages; i++) {
            tempConvo.conversation.push(await this.containers[entryPointId].WaitBotSays())
          }
        }
        tempConvo.conversation.push(userMessage)
        await this.containers[entryPointId].UserSays(userMessage)
        botAnswers.push(await this.containers[entryPointId].WaitBotSays())
      } else {
        for (let i = 0; i < numberOfWelcomeMessages; i++) {
          botAnswers.push(await this.containers[entryPointId].WaitBotSays())
        }
      }

      tempConvo.conversation.push(...botAnswers)
      await this._validateAnswers(botAnswers, userMessage)

      if (depth >= this.depth) {
        this._finishConversation(tempConvo, entryPointId, path)
        debug(`Conversation successfully end on '${path}' path with reaching ${depth} depth`)
        return
      }

      const requests = await this._getRequests(botAnswers, path, entryPointId)
      if (requests.length === 0 && !this.visitedPath[entryPointId].includes(path)) {
        if (this.callbackAskUser) {
          this.stuckConversations[entryPointId].push({
            path,
            convo: Object.assign({}, tempConvo)
          })
          debug(`Stuck conversation on '${path}' path`)
        } else {
          this._finishConversation(tempConvo, entryPointId, path)
          debug(`Conversation successfully end on '${path}' path with finding a leaf`)
        }
        return
      }

      let hasStuckedRequest = false
      for (const request of requests) {
        const requestPath = request.payload ? path + request.text + JSON.stringify(request.payload) : path + request.text
        const isRequestPathStucked = _.some(this.stuckConversations[entryPointId],
          stuckConversation => stuckConversation.path === requestPath)
        if (isRequestPathStucked) {
          hasStuckedRequest = true
        }

        if (!this.visitedPath[entryPointId].includes(requestPath) && !isRequestPathStucked &&
            !(this.ignoreSteps.includes(request.text) || this.ignoreSteps.includes(request.payload))) {
          if (depth === 0) {
            tempConvo.header.name = `${tempConvo.header.name}_${request.text.substring(0, 16)}`
          }

          const userMessage = {
            sender: 'me',
            messageText: request.text
          }
          if (!request.isUserRequest) {
            userMessage.buttons = [request]
          }

          const params = {
            userMessage,
            depth: depth + 1,
            path: requestPath,
            entryPointId,
            tempConvo
          }
          await this._makeConversation(params)

          return
        }
      }

      if (hasStuckedRequest) {
        this.stuckConversations[entryPointId].push({ path })
      } else {
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

  _finishConversation (tempConvo, entryPointId, path) {
    tempConvo.header.name = `${entryPointId}.${this.convos[entryPointId].length}_${tempConvo.header.name}`
    this.convos[entryPointId].push(Object.assign({}, tempConvo))
    this.visitedPath[entryPointId].push(path)
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

  async _getRequests (botAnswers, path, entryPointId) {
    const requests = []
    requests.push(...(await getAllValuesByKeyFromObjects(botAnswers)))
    if (requests.length === 0) {
      const userRequest = _.find(this.userRequests[entryPointId], userRequest => userRequest.path === path)
      if (userRequest) {
        requests.push(...userRequest.texts.map(text => ({ text, isUserRequest: true })))
      }
    }
    return requests
  }
}
