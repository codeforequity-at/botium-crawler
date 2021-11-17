const crypto = require('crypto')
const _ = require('lodash')
const urlRegex = require('url-regex-safe')
const debug = require('debug')('botium-crawler-crawler')
const debugProgress = require('debug')('botium-crawler-progress')
const { BotDriver } = require('botium-core')
const { getAllValuesByKeyFromObjects, startContainer, stopContainer } = require('./util')

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
    this.pathTree = []
    this.stuckConversations = []
    this.userAnswers = []
    this.endOfConversations = []
    this.convoDialogsHash = []
    this.convoCount = 0
    this.lastCrawlConvoNames = {}
    this.nameCounter = 1
  }

  async crawl ({
    entryPoints = [], numberOfWelcomeMessages = 0, depth = 5, exitCriteria = [],
    waitForPrompt = null, userAnswers = [], endOfConversations = [], lastCrawlConvoNames = {}
  }) {
    debugProgress(`A crawler started with the following params:
      entryPoints: ${JSON.stringify(entryPoints)},
      depth: ${depth},
      numberOfWelcomeMessages: ${numberOfWelcomeMessages},
      exitCriteria: ${JSON.stringify(exitCriteria)},
      waitForPrompt: ${waitForPrompt},
      userAnswers: ${JSON.stringify(userAnswers, 0, 2)},
      endOfConversations: ${JSON.stringify(endOfConversations)}`
    )

    const result = {}
    let entryPointId = 0
    try {
      if (!Array.isArray(entryPoints)) {
        debug('The entryPoints param has to be an array of strings')
        return this.convos
      }
      this.userAnswers = userAnswers
      this.endOfConversations = endOfConversations
      this.lastCrawlConvoNames = lastCrawlConvoNames

      const welcomeMessageEntryPoint = await this._validateNumberOfWelcomeMessage(numberOfWelcomeMessages)
      if (entryPoints.length === 0) {
        entryPoints = welcomeMessageEntryPoint || DEFAULT_ENTRY_POINTS
      }

      let hasWelcomeAndEntryPoint = false
      if (entryPoints.length > 0 && welcomeMessageEntryPoint && welcomeMessageEntryPoint.length > 0) {
        hasWelcomeAndEntryPoint = true
      }

      this.depth = depth
      this.exitCriteria = exitCriteria
      await Promise.all(entryPoints.map(async (entryPointText) => {
        return this._makeConversations(entryPointText, hasWelcomeAndEntryPoint ? `${WELCOME_MESSAGE_ENTRY_POINT};${entryPointText}` : entryPointText, entryPointId++, numberOfWelcomeMessages, waitForPrompt)
      }))
    } catch (e) {
      result.err = e.message
      debugProgress('Crawler finished with error: ', e)
    }

    if (!result.err) {
      debugProgress('Crawler finished successful')
    }
    result.convos = this.convos
    return result
  }

  async _makeConversations (entryPointText, path, entryPointId, numberOfWelcomeMessages, waitForPrompt) {
    if (typeof entryPointText !== 'string') {
      debug('The entryPoints param has to consist of strings')
      return
    }
    this.convos[entryPointId] = []
    this.visitedPath[entryPointId] = []
    this.stuckConversations[entryPointId] = []
    this.convoDialogsHash[entryPointId] = []
    let firstTry = true

    while (firstTry || this.stuckConversations[entryPointId].length > 0) {
      firstTry = false
      if (this.callbackAskUser && this.stuckConversations[entryPointId].length > 0) {
        _.remove(this.stuckConversations[entryPointId], stuckConversation => !stuckConversation.convo)
        const userResponses = await this.callbackAskUser(this.stuckConversations[entryPointId])

        for (const userResponse of userResponses) {
          if (userResponse.answers && userResponse.answers.length > 0) {
            this.userAnswers.push(userResponse)
          } else {
            const stuckConversation = _.find(this.stuckConversations[entryPointId],
              stuckConversation => stuckConversation.path === userResponse.path)
            this._finishConversation(stuckConversation.convo, entryPointId, userResponse.path)
            debug(`Conversation successfully ended by user on '${userResponse.path}' path`)
          }
        }
        this.stuckConversations[entryPointId] = []
      }

      while (!this.visitedPath[entryPointId].includes(path) &&
      !_.some(this.stuckConversations[entryPointId], stuckConversation => stuckConversation.path === path)) {
        this.containers[entryPointId] = await startContainer(this.driver)
        const params = {
          numberOfWelcomeMessages,
          depth: 1,
          path,
          entryPointId,
          waitForPrompt,
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
        await stopContainer(this.containers[entryPointId])
      }
    }
  }

  async _makeConversation ({ userMessage, numberOfWelcomeMessages, depth, path, entryPointId, waitForPrompt, tempConvo }) {
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
        if (waitForPrompt > 0) {
          const checkPoint = Date.now()
          do {
            const waitForPromptLeft = Math.max(0, waitForPrompt - (Date.now() - checkPoint))
            try {
              botAnswers.push(await this.containers[entryPointId].WaitBotSays(null, waitForPromptLeft))
            } catch (err) {
              if (err.message.indexOf('Bot did not respond within') < 0) throw err
            }
          }
          while (Date.now() - checkPoint <= waitForPrompt)
        }
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
        return true
      }

      if (this.endOfConversations.includes(path)) {
        tempConvo.stucked = true
        tempConvo.markedWithEndOfConversation = true
        this._finishConversation(tempConvo, entryPointId, path)
        debug(`Conversation successfully end on '${path}' path, because it is marked as end of conversation`)
        return true
      }

      const convoDialog = {
        botMessages: []
      }
      if (userMessage) {
        const pureUserMessage = Object.assign({}, userMessage)
        delete pureUserMessage.sourceData
        convoDialog.userMessage = pureUserMessage
      }
      for (const botAnswer of botAnswers) {
        const pureBotAnswer = Object.assign({}, botAnswer)
        delete pureBotAnswer.sourceData
        convoDialog.botMessages.push(pureBotAnswer)
      }

      const convoDialogHash = crypto.createHash('md5').update(JSON.stringify(convoDialog)).digest('hex')
      if (this.convoDialogsHash[entryPointId].includes(convoDialogHash)) {
        tempConvo.stucked = true
        tempConvo.circleFound = true
        this._finishConversation(tempConvo, entryPointId, path)
        debug(`Conversation end on '${path}' path, because a circle found`)
        return true
      }
      this.convoDialogsHash[entryPointId].push(convoDialogHash)

      const requests = await this._getRequests(botAnswers, path)
      if (requests.length === 0 && !this.visitedPath[entryPointId].includes(path)) {
        if (this.callbackAskUser) {
          this.stuckConversations[entryPointId].push({
            path,
            convo: Object.assign({}, tempConvo)
          })
          debug(`Stuck conversation on '${path}' path`)
          return false
        } else {
          if (depth === 1) {
            throw new Error('Conversation stopped at the first conversation step.')
          }
          tempConvo.stucked = true
          this._finishConversation(tempConvo, entryPointId, path)
          debug(`Conversation successfully end on '${path}' path with finding an open-ended question`)
          return true
        }
      }

      const filteredRequests = []
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

        if (!this.visitedPath[entryPointId].includes(requestPath) && !isRequestPathStucked) {
          filteredRequests.push(request)
        }
      }

      let pathVisited = false
      if (filteredRequests.length === 1) {
        pathVisited = true
      }

      if (filteredRequests.length > 0) {
        const request = filteredRequests[0]
        const requestPath = request.payload
          ? path + PATH_SEPARATOR + request.text + JSON.stringify(request.payload)
          : path + PATH_SEPARATOR + request.text

        if (this.exitCriteria.length > 0) {
          const exit = this.exitCriteria.some((exitCrit) => {
            const lowerCaseExistCrit = exitCrit.toLowerCase()
            let exitOnPayload = false
            if (request.payload) {
              exitOnPayload = _.isObject(request.payload)
                ? JSON.stringify(request.payload).toLowerCase().startsWith(lowerCaseExistCrit)
                : request.payload.toLowerCase().startsWith(lowerCaseExistCrit)
            }
            return exitOnPayload || request.text.toLowerCase().startsWith(lowerCaseExistCrit)
          })
          if (exit) {
            this._finishConversation(tempConvo, entryPointId, requestPath)
            debug(`Conversation successfully end on '${requestPath}' path with matching to one of the exit criteria`)
            return pathVisited
          }
        }

        const userMessage = {
          sender: 'me'
        }
        if (request.payload) {
          userMessage.messageText = _.isObject(request.payload) ? JSON.stringify(request.payload) : request.text
        } else {
          userMessage.messageText = request.text
        }

        if (request.isUserRequest) {
          userMessage.userFeedback = true
        } else {
          userMessage.buttons = [request]
        }

        const params = {
          userMessage,
          depth: depth + 1,
          path: requestPath,
          entryPointId,
          waitForPrompt,
          tempConvo
        }
        const allChildVisited = await this._makeConversation(params)
        if (pathVisited && allChildVisited && !hasStuckedRequest) {
          debug(`All child nodes are visited for '${path}' path`)
          this.visitedPath[entryPointId].push(path)
        }

        return pathVisited && allChildVisited
      }

      if (hasStuckedRequest) {
        this.stuckConversations[entryPointId].push({ path })
        this.convoDialogsHash[entryPointId] = []
        debug(`Stuck conversation on '${path}' path`)
        return false
      } else {
        this.visitedPath[entryPointId].push(path)
        this.convoDialogsHash[entryPointId] = []
        debug(`The '${path}' path is visited`)
        return true
      }
    } catch (e) {
      tempConvo.err = e.message
      this._finishConversation(tempConvo, entryPointId, path)
      debug(`Conversation failed on '${path}' path with the following user message: `, userMessage)
      debug('error: ', e)
    }
  }

  _finishConversation (tempConvo, entryPointId, path) {
    this.convoDialogsHash[entryPointId] = []
    const pathHash = crypto.createHash('md5').update(path).digest('hex')
    const convoName = this.lastCrawlConvoNames[pathHash]
    if (convoName) {
      tempConvo.header.name = convoName
    } else {
      while (Object.values(this.lastCrawlConvoNames).includes(`${tempConvo.header.name}_Convo_${this.nameCounter}`)) {
        this.nameCounter++
      }
      tempConvo.header.name = `${tempConvo.header.name}_Convo_${this.nameCounter}`
      this.nameCounter++
    }

    tempConvo.path = path
    this.convos[entryPointId].push(Object.assign({}, tempConvo))
    this.visitedPath[entryPointId].push(path)
    debug(`Conversation finished on '${path} path'`)
    this.convoCount++
    debugProgress(`${this.convoCount} conversation is detected so far`)
  }

  async _validateNumberOfWelcomeMessage (numberOfWelcomeMessages, entryPointId = 'general') {
    let welcomeMessageEntryPoint
    this.containers[entryPointId] = await startContainer(this.driver)
    if (numberOfWelcomeMessages > 0) {
      for (let i = 0; i < numberOfWelcomeMessages; i++) {
        try {
          await this.containers[entryPointId].WaitBotSays()
        } catch (e) {
          throw new Error(`This chat bot has less welcome message than ${numberOfWelcomeMessages}.
Please set 'numberOfWelcomeMessages' to the correct number of welcome messages.`)
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
    debug('Number of welcome messages validation is successfully ended')
    await stopContainer(this.containers[entryPointId])
    return welcomeMessageEntryPoint
  }

  async _getRequests (botAnswers, path) {
    const requests = []
    requests.push(...(await getAllValuesByKeyFromObjects(botAnswers)))
    const userRequest = _.find(this.userAnswers, userRequest => userRequest.path === path)
    if (userRequest) {
      requests.push(...userRequest.answers.map(text => ({ text, isUserRequest: true })))
    }
    return _.filter(requests, request => !request.payload ||
        (request.payload && _.isObject(request.payload)) ||
        (request.payload && _.isString(request.payload) && !urlRegex({ exact: true, strict: false }).test(request.payload)))
  }
}
