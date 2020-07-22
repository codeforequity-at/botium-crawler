const _ = require('lodash')
const urlRegex = require('url-regex')
const debug = require('debug')('botium-crawler-crawler')
const { BotDriver } = require('botium-core')
const { getAllValuesByKeyFromObjects } = require('./util')

const WELCOME_MESSAGE_ENTRY_POINT = '*welcome_message_entry_point*'
const WELCOME_MESSAGE_ENTRY_POINT_NAME = 'WELCOME_MESSAGE'
const DEFAULT_ENTRY_POINTS = ['hello', 'help']
const PATH_SEPARATOR = ';'

module.exports = class Crawler {
  constructor ({ driver, config }, callbackAskUser, callbackValidatior) {
    if (driver) {
      this.driver = driver
    } else {
      this.driver = new BotDriver(config && config.Capabilities, config && config.Sources, config && config.Envs)
    }
    this.containers = {}
    this.callbackValidatior = callbackValidatior
    this.callbackAskUser = callbackAskUser
    this.convos = []
    this.visitedPath = []
    this.pathCounter = {}
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
        const userResponses = await this.callbackAskUser(this.stuckConversations[entryPointId])

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
          depth: 1,
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
        if (depth === 1 && numberOfWelcomeMessages > 0) {
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
      if (this.callbackValidatior) {
        await this.callbackValidatior(botAnswers, userMessage)
      }

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
        const requestPath = request.payload
          ? path + PATH_SEPARATOR + request.text + JSON.stringify(request.payload)
          : path + PATH_SEPARATOR + request.text
        const isRequestPathStucked = _.some(this.stuckConversations[entryPointId],
          stuckConversation => stuckConversation.path === requestPath)
        if (isRequestPathStucked) {
          hasStuckedRequest = true
        }

        if (!this.visitedPath[entryPointId].includes(requestPath) && !isRequestPathStucked &&
            !(this.ignoreSteps.includes(request.text) || this.ignoreSteps.includes(request.payload))) {
          if (depth === 1) {
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
      tempConvo.header.name = `${tempConvo.header.name}_FAILED`
      this._finishConversation(tempConvo, entryPointId, path)
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
    let partialPath = ''
    let prefix = `${entryPointId + 1}`
    const pathElements = path.split(PATH_SEPARATOR)

    for (let i = 0; i < pathElements.length; i++) {
      const pathElement = pathElements[i]
      if (i === 0) {
        partialPath = pathElement
      } else {
        partialPath = partialPath + PATH_SEPARATOR + pathElement
        if (!this.pathCounter[partialPath]) {
          this.pathCounter[partialPath] = 1
        }
        prefix = `${prefix}.${this.pathCounter[partialPath]}`
        this.pathCounter[partialPath]++
      }
    }
    tempConvo.header.name = `${prefix}_${tempConvo.header.name}`
    this.convos[entryPointId].push(Object.assign({}, tempConvo))
    this.visitedPath[entryPointId].push(path)
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
    return _.filter(requests, request => !request.payload ||
      (request.payload && _.isString(request.payload) && !urlRegex({ exact: true, strict: false }).test(request.payload)))
  }
}
