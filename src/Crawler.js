const _ = require('lodash')
const urlRegex = require('url-regex-safe')
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
    this.pathTree = []
    this.stuckConversations = []
    this.userAnswers = []
  }

  async crawl ({ entryPoints = [], numberOfWelcomeMessages = 0, depth = 5, exitCriteria = [], waitForPrompt = null, userAnswers = [] }) {
    debug(`A crawler started with the following params:
      entryPoints: ${JSON.stringify(entryPoints)},
      depth: ${depth},
      numberOfWelcomeMessages: ${numberOfWelcomeMessages},
      exitCriteria: ${JSON.stringify(exitCriteria)},
      waitForPrompt: ${waitForPrompt},
      userAnswers: ${JSON.stringify(userAnswers, 0, 2)}`)

    if (!Array.isArray(entryPoints)) {
      debug('The entryPoints param has to be an array of strings')
      return this.convos
    }
    this.userAnswers = userAnswers

    const welcomeMessageEntryPoint = await this._validateNumberOfWelcomeMessage(numberOfWelcomeMessages)
    if (entryPoints.length === 0) {
      entryPoints = welcomeMessageEntryPoint || DEFAULT_ENTRY_POINTS
    }

    this.depth = depth
    this.exitCriteria = exitCriteria
    let entryPointId = 0
    await Promise.all(entryPoints.map(async (entryPointText) => {
      return this._makeConversations(entryPointText, entryPointId++, numberOfWelcomeMessages, waitForPrompt)
    }))

    debug('Crawler finished')
    return this.convos
  }

  async _makeConversations (entryPointText, entryPointId, numberOfWelcomeMessages, waitForPrompt) {
    if (typeof entryPointText !== 'string') {
      debug('The entryPoints param has to consist of strings')
      return
    }
    this.convos[entryPointId] = []
    this.visitedPath[entryPointId] = []
    this.stuckConversations[entryPointId] = []
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

      while (!this.visitedPath[entryPointId].includes(entryPointText) &&
      !_.some(this.stuckConversations[entryPointId], stuckConversation => stuckConversation.path === entryPointText)) {
        await this._start(entryPointId)
        const params = {
          numberOfWelcomeMessages,
          depth: 1,
          path: entryPointText,
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
        await this._stop(entryPointId)
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
        return
      }

      const requests = await this._getRequests(botAnswers, path)
      if (requests.length === 0 && !this.visitedPath[entryPointId].includes(path)) {
        if (this.callbackAskUser) {
          this.stuckConversations[entryPointId].push({
            path,
            convo: Object.assign({}, tempConvo)
          })
          debug(`Stuck conversation on '${path}' path`)
        } else {
          if (depth === 1) {
            throw new Error('Conversation stopped at the first conversation step.')
          }
          tempConvo.stucked = true
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

        if (!this.visitedPath[entryPointId].includes(requestPath) && !isRequestPathStucked) {
          if (depth === 1) {
            tempConvo.header.name = `${tempConvo.header.name}_${request.text.substring(0, 16)}`
          }

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
              return
            }
          }

          const userMessage = {
            sender: 'me',
            messageText: request.payload ? JSON.stringify(request.payload) : request.text
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
      tempConvo.err = e.message
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
    const pathElements = path.split(PATH_SEPARATOR)
    const prefix = this._getPrefix(this.pathTree, 0, pathElements)

    tempConvo.header.name = `${prefix}_${tempConvo.header.name}`
    tempConvo.path = path
    this.convos[entryPointId].push(Object.assign({}, tempConvo))
    this.visitedPath[entryPointId].push(path)
  }

  _getPrefix (elements, pathElementIndex, pathElements, prefix) {
    const pathElement = pathElements[pathElementIndex]
    let index = _.findIndex(elements, e => e.name === pathElement)
    if (index < 0) {
      elements.push({
        name: pathElement,
        children: []
      })
      index = elements.length - 1
    }
    if (!prefix) {
      prefix = index + 1
    } else {
      prefix = `${prefix}.${index + 1}`
    }
    if (pathElements.indexOf(pathElement) >= 0 && pathElements.length > pathElementIndex + 1) {
      return this._getPrefix(elements[index].children, pathElementIndex + 1, pathElements, prefix)
    }
    return prefix
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
    await this._stop(entryPointId)
    return welcomeMessageEntryPoint
  }

  async _getRequests (botAnswers, path) {
    const requests = []
    requests.push(...(await getAllValuesByKeyFromObjects(botAnswers)))
    if (requests.length === 0) {
      const userRequest = _.find(this.userAnswers, userRequest => userRequest.path === path)
      if (userRequest) {
        requests.push(...userRequest.answers.map(text => ({ text, isUserRequest: true })))
      }
    }
    return _.filter(requests, request => !request.payload ||
        (request.payload && _.isObject(request.payload)) ||
        (request.payload && _.isString(request.payload) && !urlRegex({ exact: true, strict: false }).test(request.payload)))
  }
}
