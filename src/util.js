const fs = require('fs')
const path = require('path')
const readlineSync = require('readline-sync')
const flatten = require('flat')
const _ = require('lodash')
const debug = require('debug')('botium-crawler-util')

const SOURCE_DATA = 'sourceData'
const BUTTONS = 'buttons'

const startContainer = async (driver) => {
  debug('Conversation container built, now starting')
  const container = await driver.Build()
  const scriptingProvider = driver.BuildCompiler()
  const scriptingContext = scriptingProvider.BuildScriptContext()
  try {
    await container.Start()
    await scriptingContext.scriptingEvents.onConvoBegin({ container })
    debug('Conversation container started.')
    return container
  } catch (err) {
    try {
      await scriptingContext.scriptingEvents.onConvoEnd({ container })
      await container.Stop()
    } catch (err) {
      debug(`Conversation Stop failed: ${err}`)
    }
    try {
      await container.Clean()
    } catch (err) {
      debug(`Conversation Clean failed: ${err}`)
    }
    throw new Error(`Failed to start new conversation: ${err.message}`)
  }
}

const stopContainer = async (container, driver) => {
  const scriptingProvider = driver.BuildCompiler()
  const scriptingContext = scriptingProvider.BuildScriptContext()
  if (container) {
    try {
      await scriptingContext.scriptingEvents.onConvoEnd({ container })
      await container.Stop()
    } catch (err) {
      debug(`Conversation Stop failed: ${err}`)
    }
    try {
      await container.Clean()
    } catch (err) {
      debug(`Conversation Clean failed: ${err}`)
    }
  }
  debug('Conversation container stopped.')
}

const getAllValuesByKeyFromObjects = (objects, key = BUTTONS, exceptUnder = SOURCE_DATA) => {
  const values = []
  for (const object of objects) {
    values.push(...getAllValuesByKeyFromObject(object, key, exceptUnder))
  }
  return values
}

const getAllValuesByKeyFromObject = (object, key = BUTTONS, exceptUnder = SOURCE_DATA) => {
  const values = []

  const objectKeys = _.filter(
    _.keys(flatten(object)),
    objectKey => objectKey.includes(key) && !objectKey.includes(exceptUnder))

  const uniqObjectKeys = [...new Set(objectKeys.map(objectKey =>
    objectKey.substring(0, objectKey.indexOf(key) + key.length)))]

  uniqObjectKeys.forEach(objectKey => {
    const valueForKey = _.get(object, objectKey)
    if (Array.isArray(valueForKey)) {
      values.push(...valueForKey)
    } else {
      values.push(valueForKey)
    }
  })
  return values
}

const askUserFeedbackOnConsole = async (stuckConversations, compiler, recycleUserFeedback, output) => {
  const userFeedbacks = []
  let userFeedbacksPath
  if (recycleUserFeedback) {
    userFeedbacksPath = path.join(output, 'userFeedback.json')
    if (fs.existsSync(userFeedbacksPath)) {
      userFeedbacks.push(...JSON.parse(fs.readFileSync(userFeedbacksPath, 'utf8')))
    }
  }
  const userResponses = stuckConversations.map(stuckConversation => ({ path: stuckConversation.path }))
  let skipAll = false

  for (const stuckConversation of stuckConversations) {
    const userResponse = _.find(userResponses, userResponse => userResponse.path === stuckConversation.path)
    userResponse.answers = []

    const script = compiler.Decompile([stuckConversation.convo], 'SCRIPTING_FORMAT_TXT')

    if (skipAll) {
      if (recycleUserFeedback) {
        userFeedbacks.push({
          path: userResponse.path,
          script,
          answers: userResponse.answers
        })
      }
      continue
    }

    if (recycleUserFeedback && userFeedbacks.length > 0) {
      const userFeedbackToReuse = _.find(userFeedbacks,
        userFeedback => userFeedback.path === stuckConversation.path)
      if (userFeedbackToReuse) {
        userResponse.answers.push(...userFeedbackToReuse.answers)
        continue
      }
    }
    console.log(`\n---------------------------------------\n
    ${script}
    \n---------------------------------------\n`)
    const contiueAnswer = readlineSync.question('This path is stucked before reaching depth. \n' +
      'Would you like to continue with your own answers?  [yes, no, no all]: ', { limit: ['yes', 'no', 'no all'] })

    if (contiueAnswer === 'no all' || contiueAnswer === 'no') {
      if (recycleUserFeedback) {
        userFeedbacks.push({
          path: userResponse.path,
          script,
          answers: userResponse.answers
        })
      }
      if (contiueAnswer === 'no all') {
        skipAll = true
      }
      continue
    }

    if (contiueAnswer === 'yes') {
      let additionalAnswer = 'yes'
      let i = 1
      while (additionalAnswer === 'yes') {
        userResponse.answers.push(readlineSync.question(`Enter your ${i++}. answer: `))
        additionalAnswer = readlineSync.question('Do you want to add additional answers? [yes, no]: ',
          { limit: ['yes', 'no'] })
      }
      if (recycleUserFeedback) {
        userFeedbacks.push({
          path: userResponse.path,
          script,
          answers: userResponse.answers
        })
      }
    }
  }
  if (recycleUserFeedback) {
    if (!fs.existsSync(output)) {
      fs.mkdirSync(output)
    }
    fs.writeFileSync(userFeedbacksPath, JSON.stringify(userFeedbacks, 0, 2), 'utf8')
  }
  return userResponses
}

module.exports = {
  startContainer,
  stopContainer,
  getAllValuesByKeyFromObject,
  getAllValuesByKeyFromObjects,
  askUserFeedbackOnConsole
}
