const util = require('util')
const _ = require('lodash')
const slugify = require('slugify')
const debug = require('debug')('botium-crawler-convo-handler')
const Capabilities = require('botium-core').Capabilities

const SCRIPTING_FORMAT = 'SCRIPTING_FORMAT_TXT'

module.exports = class ConvoHandler {
  constructor (compiler) {
    this.compiler = compiler
  }

  async decompileConvos ({ convos, mergeUtterances = true }) {
    debug('Decompile convos')
    const flatConvos = _.flatten(convos)
    let scriptObjects = await Promise.all(
      flatConvos.map(async (convo) => {
        return this._getConversationScripts(convo)
      })
    )
    const generalUtterances = []
    if (mergeUtterances) {
      generalUtterances.push(...this._getGeneralUtterances(scriptObjects))
      scriptObjects = this._replaceUttReferencesInScriptObject(generalUtterances, scriptObjects)
    }
    return {
      scriptObjects,
      generalUtterances
    }
  }

  async _getConversationScripts (convo) {
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
            const utteranceName = slugify(`UTT_${convo.header.name}_${step.sender}_${statistics[step.sender] + 1}`).toUpperCase()
            const utteranceValue = step.messageText
            step.messageText = utteranceName

            utterances[step.sender].push({
              script: utteranceName + this.compiler.caps[Capabilities.SCRIPTING_TXT_EOL] + utteranceValue,
              name: utteranceName
            })

            statistics[step.sender]++
            statistics.utterances.push(utteranceName)
          } else {
            statistics.filteredOut++
          }
        }
      }
    }

    debug(`Decompiled utterances: ${util.inspect(statistics)}`)
    const scriptDecompiled = this.compiler.Decompile([convo], SCRIPTING_FORMAT)
    debug(`Decompiled script: ${scriptDecompiled}`)

    return { name: convo.header.name, script: scriptDecompiled, stucked: convo.stucked, markedWithEndOfConversation: convo.markedWithEndOfConversation, path: convo.path, botUtterances: utterances.bot, meUtterances: utterances.me, err: convo.err }
  }

  _getGeneralUtterances (scriptObjects) {
    const botUtterances = []
    const meUtterances = []
    for (const scriptObject of scriptObjects) {
      botUtterances.push(...scriptObject.botUtterances)
      meUtterances.push(...scriptObject.meUtterances)
    }

    return [...this._mergeUtterances(botUtterances, 'BOT'), ...this._mergeUtterances(meUtterances, 'ME')]
  }

  _mergeUtterances (utterances, suffix) {
    const mergedUtterances = _.uniqWith(utterances, (utt, otherUtt) =>
      utt.script.substring(utt.script.indexOf(this.compiler.caps[Capabilities.SCRIPTING_TXT_EOL])) ===
      otherUtt.script.substring(otherUtt.script.indexOf(this.compiler.caps[Capabilities.SCRIPTING_TXT_EOL]))
    ).map(u => ({ ...u }))

    let counter = 1
    for (const mergedUtt of mergedUtterances) {
      mergedUtt.occurances = _.filter(utterances,
        (utt) =>
          utt.script.substring(utt.script.indexOf(this.compiler.caps[Capabilities.SCRIPTING_TXT_EOL])) ===
          mergedUtt.script.substring(mergedUtt.script.indexOf(this.compiler.caps[Capabilities.SCRIPTING_TXT_EOL])))
        .map((utt) => utt.name)

      if (mergedUtt.occurances.length > 1) {
        const indexOfEol = mergedUtt.script.indexOf(this.compiler.caps[Capabilities.SCRIPTING_TXT_EOL])
        const start = indexOfEol + this.compiler.caps[Capabilities.SCRIPTING_TXT_EOL].length
        mergedUtt.name = `UTT_M${counter++}_${slugify(mergedUtt.script.substring(start, start + 32)).toUpperCase()}_${suffix}`
        mergedUtt.script = mergedUtt.script.replace(mergedUtt.script.substring(0, indexOfEol), mergedUtt.name)
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
              new RegExp(occurance + this.compiler.caps[Capabilities.SCRIPTING_TXT_EOL], 'g'),
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
