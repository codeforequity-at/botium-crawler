const fs = require('fs')
const path = require('path')
const readlineSync = require('readline-sync')
const flatten = require('flat')
const _ = require('lodash')
const { BotDriver } = require('botium-core')

const SOURCE_DATA = 'sourceData'
const BUTTONS = 'buttons'

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

const askUserFeedbackOnConsole = async (stuckConversations, crawler, recycleUserFeedback, output) => {
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
    userResponse.texts = []

    const script = crawler.compiler.Decompile([stuckConversation.convo], 'SCRIPTING_FORMAT_TXT')

    if (skipAll) {
      if (recycleUserFeedback) {
        userFeedbacks.push({
          path: userResponse.path,
          script,
          answers: userResponse.texts
        })
      }
      continue
    }

    console.log(`\n---------------------------------------\n
    ${script}
    \n---------------------------------------\n`)

    if (recycleUserFeedback && userFeedbacks.length > 0) {
      const userFeedbackToReuse = _.find(userFeedbacks,
        userFeedback => userFeedback.path === stuckConversation.path)
      if (userFeedbackToReuse) {
        userResponse.texts.push(...userFeedbackToReuse.answers)
        continue
      }
    }

    const contiueAnswer = readlineSync.question('This path is stucked before reaching depth. \n' +
      'Would you like to continue with your own answers?  [yes, no, no all]: ', { limit: ['yes', 'no', 'no all'] })

    if (contiueAnswer === 'no all' || contiueAnswer === 'no') {
      if (recycleUserFeedback) {
        userFeedbacks.push({
          path: userResponse.path,
          script,
          answers: userResponse.texts
        })
      }
      if (contiueAnswer === 'no all') {
        skipAll = true
      }
      continue
    }

    if (contiueAnswer === 'yes') {
      let additionalAnswer = true
      let i = 1
      while (additionalAnswer) {
        userResponse.texts.push(readlineSync.question(`Enter your ${i++}. answer: `))
        additionalAnswer = readlineSync.keyInYN('Do you want to add additional answers?')
      }
      if (recycleUserFeedback) {
        userFeedbacks.push({
          path: userResponse.path,
          script,
          answers: userResponse.texts
        })
      }
    }
  }
  if (recycleUserFeedback) {
    if (!fs.existsSync(output)) {
      fs.mkdirSync(output)
    }
    fs.writeFileSync(userFeedbacksPath, JSON.stringify(userFeedbacks), 'utf8')
  }
  return userResponses
}

const getBotiumDriver = (configPath) => {
  const configObject = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  if (!configObject.botium) {
    console.error(`'botium' property is missing from the '${configPath}' file`)
    return
  }
  const botiumConfig = configObject.botium
  return new BotDriver(botiumConfig && botiumConfig.Capabilities,
    botiumConfig && botiumConfig.Sources,
    botiumConfig && botiumConfig.Envs)
}

module.exports = {
  getAllValuesByKeyFromObject,
  getAllValuesByKeyFromObjects,
  askUserFeedbackOnConsole,
  getBotiumDriver
}
