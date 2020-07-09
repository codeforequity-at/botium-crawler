const fs = require('fs')
const path = require('path')
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

  async persistConvosInFiles ({ convos, output, mergeUtterances }) {
    let scriptObjects = await this._decompileConvos(convos)
    const utterances = []
    if (mergeUtterances) {
      utterances.push(...this._mergeUtterances(scriptObjects))
      scriptObjects = this._replaceUttReferencesInScriptObject(utterances, scriptObjects)
    }
    if (!fs.existsSync(output)) {
      fs.mkdirSync(output)
    }

    scriptObjects.forEach((scriptObject) => {
      const script = scriptObject.script
      const scriptName = path.join(output,
        slugify(
          script.substring(0, script.indexOf(this.compiler.caps[Capabilities.SCRIPTING_TXT_EOL]))).toUpperCase() +
        '.convo.txt')
      fs.writeFileSync(scriptName, script)
      debug(`The '${scriptName}' file is persisted`)

      scriptObject.utterances.forEach((utterance) => {
        const utteranceName = path.join(output, utterance.name)
        fs.writeFileSync(utteranceName + '.utterances.txt', utterance.script)
      })
    })

    utterances.forEach((utterance) => {
      const utteranceName = path.join(output, utterance.name)
      fs.writeFileSync(utteranceName + '.utterances.txt', utterance.script)
    })
  }

  async _decompileConvos (convos) {
    debug('Decompile convos')
    const flatConvos = _.flatten(convos)
    return Promise.all(
      flatConvos.map(async (convo) => {
        return this._getConversationScripts(convo)
      })
    )
  }

  async _getConversationScripts (convo) {
    const utterances = []
    const statistics = { all: 0, empty: 0, multirow: 0, me: 0, bot: 0, filteredOut: 0, utterances: [] }
    for (const step of convo.conversation) {
      statistics.all++
      if (!step.messageText || !step.messageText.length) {
        statistics.empty++
      } else {
        if (step.messageText.includes(this.compiler.caps[Capabilities.SCRIPTING_TXT_EOL])) {
          statistics.multirow++
        } else {
          if (step.sender === 'bot') {
            const utteranceName = slugify(`${convo.header.name}_${step.sender}_${statistics[step.sender] + 1}`).toUpperCase()
            const utteranceValue = step.messageText
            step.messageText = utteranceName

            utterances.push({
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
      debug(`Decompiled utterances: ${util.inspect(statistics)}`)
    }

    const scriptDecompiled = this.compiler.Decompile([convo], SCRIPTING_FORMAT)
    debug(`Decompiled script: ${scriptDecompiled}`)

    return { script: scriptDecompiled, utterances }
  }

  _mergeUtterances (scriptObjects) {
    const utterances = []
    for (const scriptObject of scriptObjects) {
      utterances.push(...scriptObject.utterances)
    }
    const mergedUtterances = _.uniqWith(utterances, (utt, otherUtt) =>
      utt.script.substring(utt.script.indexOf(this.compiler.caps[Capabilities.SCRIPTING_TXT_EOL])) ===
        otherUtt.script.substring(otherUtt.script.indexOf(this.compiler.caps[Capabilities.SCRIPTING_TXT_EOL]))
    )

    let counter = 0
    for (const mergedUtt of mergedUtterances) {
      mergedUtt.occurances = _.filter(utterances,
        (utt) =>
          utt.script.substring(utt.script.indexOf(this.compiler.caps[Capabilities.SCRIPTING_TXT_EOL])) ===
        mergedUtt.script.substring(mergedUtt.script.indexOf(this.compiler.caps[Capabilities.SCRIPTING_TXT_EOL])))
        .map((utt) => utt.name)

      if (mergedUtt.occurances.length > 1) {
        const indexOfEol = mergedUtt.script.indexOf(this.compiler.caps[Capabilities.SCRIPTING_TXT_EOL])
        const start = indexOfEol + this.compiler.caps[Capabilities.SCRIPTING_TXT_EOL].length
        mergedUtt.name = `${counter++}_${slugify(mergedUtt.script.substring(start, start + 32)).toUpperCase()}`
        mergedUtt.script = mergedUtt.script.replace(mergedUtt.script.substring(0, indexOfEol), mergedUtt.name)
      }
    }

    return mergedUtterances
  }

  _replaceUttReferencesInScriptObject (utterances, scriptObjects) {
    const replacedScriptObjects = [...scriptObjects]
    for (const utterance of utterances) {
      if (utterance.occurances.length > 1) {
        for (const scirptObject of replacedScriptObjects) {
          for (const occurance of utterance.occurances) {
            scirptObject.script = scirptObject.script.replace(new RegExp(occurance, 'g'), utterance.name)
          }
          scirptObject.utterances = []
        }
      }
    }
    return replacedScriptObjects
  }
}
