const flatten = require('flat')
const _ = require('lodash')
const logger = require('./logger')

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
    objectKey => objectKey.includes(key) && !objectKey.includes('sourceData'))

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

const validationErrorHandler = (message, payload) => {
  logger.error(message, { payload })
}

module.exports = {
  getAllValuesByKeyFromObject,
  getAllValuesByKeyFromObjects,
  validationErrorHandler
}
