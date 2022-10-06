const util = require('util')
const _ = require('lodash')
const crypto = require('crypto')
const slugify = require('slugify')
const debug = require('debug')('botium-crawler-convo-handler')
const Capabilities = require('botium-core').Capabilities

const SCRIPTING_FORMAT = 'SCRIPTING_FORMAT_TXT'

module.exports = class ConvoHandler {
  constructor (compiler) {
    this.compiler = compiler
    this.lastCrawlUtteranceNames = {}
    this.utteranceNameCounter = 1
    this.mergedUtteranceNameCounter = 1
  }

  async decompileConvos ({ crawlerResult, generateUtterances = true, mergeUtterances = true, lastCrawlUtteranceNames = {}, utterancePrefix }) {
    debug('Decompile convos')
    this.lastCrawlUtteranceNames = lastCrawlUtteranceNames
    this.utterancePrefix = utterancePrefix
    const flatConvos = _.flatten(crawlerResult.convos)
    let scriptObjects = await Promise.all(
      flatConvos.map(async (convo) => {
        return this._getConversationScripts(convo, generateUtterances)
      })
    )
    const generalUtterances = []
    if (generateUtterances && mergeUtterances) {
      generalUtterances.push(...this._getGeneralUtterances(scriptObjects))
      scriptObjects = this._replaceUttReferencesInScriptObject(generalUtterances, scriptObjects)
    }
    return {
      err: crawlerResult.err,
      errDetails: crawlerResult.errDetails,
      scriptObjects,
      generalUtterances
    }
  }

  async _getConversationScripts (convo, generateUtterances) {
    const utterances = {
      bot: [],
      me: []
    }
    const statistics = { all: 0, empty: 0, multirow: 0, me: 0, bot: 0, filteredOut: 0, utterances: [] }
    for (const step of convo.conversation) {
      statistics.all++
      if (!step.messageText || !step.messageText.length) {
        statistics.empty++
      } else {
        if (step.messageText.includes(this.compiler.caps[Capabilities.SCRIPTING_TXT_EOL])) {
          statistics.multirow++
        } else {
          if (step.sender === 'bot' || (step.sender === 'me' && step.userFeedback)) {
            if (generateUtterances) {
              const valueHash = crypto.createHash('md5').update(step.messageText).digest('hex')
              let utteranceName = this.lastCrawlUtteranceNames[valueHash]
              if (!utteranceName) {
                let utterancePrefix = 'UTT'
                if (this.utterancePrefix) {
                  utterancePrefix = this.utterancePrefix
                }
                const utterancePostFix = slugify(step.messageText.substring(0, Math.min(step.messageText.length, 32)), '_').toUpperCase()
                while (Object.values(this.lastCrawlUtteranceNames).find(lcu =>
                  lcu.toLowerCase() === `${utterancePrefix}_${step.sender}_${this.utteranceNameCounter}_${utterancePostFix}`.toLowerCase())) {
                  this.utteranceNameCounter++
                }
                utteranceName = `${utterancePrefix}_${step.sender}_${this.utteranceNameCounter}_${utterancePostFix}`
                this.utteranceNameCounter++
              }
              const utteranceValue = step.messageText
              step.messageText = utteranceName

              utterances[step.sender].push({
                script: utteranceName + this.compiler.caps[Capabilities.SCRIPTING_TXT_EOL] + utteranceValue,
                name: utteranceName
              })

              statistics.utterances.push(utteranceName)
            }
            statistics[step.sender]++
          } else {
            statistics.filteredOut++
          }
        }
      }
    }

    debug(`Decompiled utterances: ${util.inspect(statistics)}`)
    const scriptDecompiled = this.compiler.Decompile([convo], SCRIPTING_FORMAT)
    debug(`Decompiled script: ${scriptDecompiled}`)

    return {
      name: convo.header.name,
      script: scriptDecompiled,
      stucked: convo.stucked,
      markedWithEndOfConversation: convo.markedWithEndOfConversation,
      circleFound: convo.circleFound,
      exitCriteriaMatch: convo.exitCriteriaMatch,
      path: convo.path,
      botUtterances: utterances.bot,
      meUtterances: utterances.me,
      err: convo.err,
      errDetails: convo.errDetails
    }
  }

  _getGeneralUtterances (scriptObjects) {
    const botUtterances = []
    const meUtterances = []
    for (const scriptObject of scriptObjects) {
      botUtterances.push(...scriptObject.botUtterances)
      meUtterances.push(...scriptObject.meUtterances)
    }

    return [...this._mergeUtterances(botUtterances, 'bot'), ...this._mergeUtterances(meUtterances, 'me')]
  }

  _mergeUtterances (utterances, sender) {
    const mergedUtterances = _.uniqWith(utterances, (utt, otherUtt) =>
      utt.script.substring(utt.script.indexOf(this.compiler.caps[Capabilities.SCRIPTING_TXT_EOL])) ===
      otherUtt.script.substring(otherUtt.script.indexOf(this.compiler.caps[Capabilities.SCRIPTING_TXT_EOL]))
    ).map(u => ({ ...u }))

    for (const mergedUtt of mergedUtterances) {
      mergedUtt.occurances = _.filter(utterances,
        (utt) =>
          utt.script.substring(utt.script.indexOf(this.compiler.caps[Capabilities.SCRIPTING_TXT_EOL])) ===
          mergedUtt.script.substring(mergedUtt.script.indexOf(this.compiler.caps[Capabilities.SCRIPTING_TXT_EOL])))
        .map((utt) => utt.name)

      if (mergedUtt.occurances.length > 1) {
        const lines = _.map(mergedUtt.script.split(this.compiler.caps[Capabilities.SCRIPTING_TXT_EOL]), (line) => line.trim())
        const utteranceValue = lines[1]
        const hashValue = crypto.createHash('md5').update(utteranceValue).digest('hex')
        if (this.lastCrawlUtteranceNames[hashValue]) {
          mergedUtt.name = this.lastCrawlUtteranceNames[hashValue]
        } else {
          let mergedUtterancePrefix = 'UTT_SHARED'
          if (this.utterancePrefix) {
            mergedUtterancePrefix = this.utterancePrefix
          }
          const utterancePostFix = slugify(utteranceValue.substring(0, Math.min(utteranceValue.length, 32)), '_').toUpperCase()
          while (Object.values(this.lastCrawlUtteranceNames).find(lcu =>
            lcu.toLowerCase() === `${mergedUtterancePrefix}_${sender}_${this.mergedUtteranceNameCounter}_${utterancePostFix}`.toLowerCase())) {
            this.mergedUtteranceNameCounter++
          }
          mergedUtt.name = `${mergedUtterancePrefix}_${sender}_${this.mergedUtteranceNameCounter}_${utterancePostFix}`
          this.mergedUtteranceNameCounter++
        }
        lines[0] = mergedUtt.name
        mergedUtt.script = lines.join(this.compiler.caps[Capabilities.SCRIPTING_TXT_EOL])
      }
    }

    return _.filter(mergedUtterances, mergedUtt => mergedUtt.occurances.length > 1)
  }

  _replaceUttReferencesInScriptObject (utterances, scriptObjects) {
    const replacedScriptObjects = [...scriptObjects]
    for (const utterance of utterances) {
      if (utterance.occurances.length > 1) {
        for (const scriptObject of replacedScriptObjects) {
          for (const occurance of utterance.occurances) {
            scriptObject.script = scriptObject.script.replace(
              new RegExp(_.escapeRegExp(occurance + this.compiler.caps[Capabilities.SCRIPTING_TXT_EOL]), 'g'),
              utterance.name + this.compiler.caps[Capabilities.SCRIPTING_TXT_EOL])
            _.remove(scriptObject.botUtterances, u => u.name === occurance)
            _.remove(scriptObject.meUtterances, u => u.name === occurance)
          }
        }
      }
    }
    return replacedScriptObjects
  }
}
