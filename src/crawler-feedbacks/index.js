const fs = require('fs')
const _ = require('lodash')
const readlineSync = require('readline-sync')

const handler = async (argv) => {
  const {
    input,
    output
  } = argv

  const userFeedbacks = JSON.parse(fs.readFileSync(input, 'utf8'))

  for (const userFeedback of userFeedbacks) {
    console.log(`\n---------------------------------------\n${userFeedback.script}
    \n---------------------------------------\n`)
    console.log('User answers:')
    for (let i = 0; i < userFeedback.answers.length; i++) {
      console.log(`${i + 1}: ${userFeedback.answers[i]}`)
    }
    console.log('\n')
    const editAnswers = readlineSync.question('What would you like to do with these answers? [add, remove, overwrite, skip, skip all]: ',
      { limit: ['add', 'remove', 'overwrite', 'skip', 'skip all'] })

    if (editAnswers === 'skip all') {
      break
    }

    if (editAnswers === 'remove') {
      userFeedback.remove = true
    }

    if (editAnswers === 'add' || editAnswers === 'overwrite') {
      if (editAnswers === 'overwrite') {
        userFeedback.answers = []
      }
      let additionalAnswer = true
      let i = userFeedback.answers.length + 1
      while (additionalAnswer) {
        userFeedback.answers.push(readlineSync.question(`Enter your ${i++}. answer: `))
        additionalAnswer = readlineSync.keyInYN('Do you want to add additional answers?')
      }
    }
  }
  _.remove(userFeedbacks, userFeedback => userFeedback.remove)
  if (readlineSync.keyInYN('Edit finished, exiting... Do you want to save your modifications?')) {
    fs.writeFileSync(output || input, JSON.stringify(userFeedbacks, 0, 2), 'utf8')
  }
}

module.exports = {
  command: 'crawler-feedbacks',
  describe: 'Edit userfeedbacks, which are used for the next crawler-run',
  builder: (yargs) => {
    yargs.option('input', {
      describe: 'The path of a json file the user feedbacks are read from.',
      type: 'string',
      default: './crawler-result/userFeedback.json'
    })
    yargs.option('output', {
      describe: 'The path of a json file the user feedbacks are stored into. (By default the same as the value of \'input\' param.)',
      type: 'string'
    })
  },
  handler
}
