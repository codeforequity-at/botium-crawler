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

  async persistConvosInFiles (convos, outputDir) {
    const scriptObjects = await this._decompileConvos(convos)
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir)
    }

    scriptObjects.forEach((scriptObject) => {
      const script = scriptObject.script
      const scriptName = path.join(outputDir,
        slugify(script.substring(0, script.indexOf(this.compiler.caps[Capabilities.SCRIPTING_TXT_EOL]))).toUpperCase())
      fs.writeFileSync(scriptName, script)
      debug(`The '${scriptName}' file is persisted`)

      scriptObject.utterances.forEach((utterance) => {
        const utteranceName = path.join(outputDir, utterance.name)
        fs.writeFileSync(utteranceName, utterance.script)
      })
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
}
