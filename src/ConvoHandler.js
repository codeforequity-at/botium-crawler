const fs = require('fs');
const rimraf = require('rimraf');
const _ = require('lodash')
const debug = require('debug')('botium-crawler-convo-handler')

const SCRIPTING_FORMAT = 'SCRIPTING_FORMAT_TXT'

module.exports = class ConvoHandler {
    constructor(botDriver) {
        this.botDriver = botDriver
    }

    async persistConvosInFiles(convos, outDir) {
        const scripts = await this._decompileConvos(convos)

        if (fs.existsSync(outDir)){
            rimraf.sync(outDir);
        }
        fs.mkdirSync(outDir);

        scripts.forEach((script) => {
            const fileName = `./${outDir}/${script.substring(0, script.indexOf('\n'))}`
            fs.writeFileSync(fileName, script);
            debug(`The '${fileName}' file is persisted`)
        })
    }

    async logConvosOnConsole(convos) {
        console.log(await this._decompileConvos(convos))
    }

    async _decompileConvos(convos) {
        const compiler = await this.botDriver.BuildCompiler()
        debug('Decompile convos')
        return Promise.all(
            convos.map(async (convo) => {
                return compiler.Decompile([convo], SCRIPTING_FORMAT)
            })
        )
    }
}
