# Botium Crawler
 
[![NPM](https://nodei.co/npm/botium-crawler.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/botium-crawler/)

[![Codeship Status for codeforequity-at/botium-crawler](https://app.codeship.com/projects/f99fdf80-ae3a-0138-43f7-5ab05f369f1d/status?branch=master)](https://app.codeship.com/projects/403709)
[![npm version](https://badge.fury.io/js/botium-crawler.svg)](https://badge.fury.io/js/botium-crawler)
[![license](https://img.shields.io/github/license/mashape/apistatus.svg)]()

Botium Crawler is a useful tool to crawl your chatbot along buttons
and generate all possible conversations. 
The generated conversations can be used as test cases in Botium Box.

**_IF YOU LIKE WHAT YOU SEE, PLEASE CONSIDER GIVING US A STAR ON GITHUB!_**

# How do I get help ?
* Read the [Botium in a Nutshell](https://medium.com/@floriantreml/botium-in-a-nutshell-part-1-overview-f8d0ceaf8fb4) series
* If you think you found a bug in Botium, please use the Github issue tracker.
* The documentation on a very technical level can be found in the [Botium Wiki](https://github.com/codeforequity-at/botium-core/wiki).
* For asking questions please use Stackoverflow - we are monitoring and answering questions there.
* For our VIP users, there is also a Slack workspace available (coming soon).

## Installation

#### Install as CLI tool
You can install directly Botium Crawler.
```
> npm install -g botium-crawler
```
Or you can use it across [Botium CLI](https://github.com/codeforequity-at/botium-cli)

#### Install as library
You can install botium crawler as library in your own project.
```
> npm install botium-crawler
```

## Using as CLI tool

Botium Crawler CLI tool is able crawl you chatbot various way according to the parameters,
and it is able to generate and store all possible conversations. 

### Commands
Basically there are two command in Botium Crawler `crawler-run` and `crawler-feedbacks`.
#### crawler-run command

    $ botium-crawler-cli crawler-run --help


**--config**

The only required parameter is the `config` parameter, 
where you have to specify the path of a json configuration file (e.g.: `botium.json`). 
(You can create it manually or export it from Botium Box)

    $ botium-crawler-cli crawler-run --config ./botium.json

**--output**

You can set the output folder of the crawler. By default the path is `./crawler-result`.
A `scripts` folder is going to be created under the output path,
and the generated convos and utterances are going to be stored here.

    $ botium-crawler-cli crawler-run --config ./botium.json --output ../custom-output

**--entryPoints**

In the entry points array you can define one or more 'user message' 
from where the crawler is going to start the conversations. 
By default the crawler is going to start with `['hello', 'help']` entry points,
if the chatbot has no auto welcome message(s). 
If the chatbot has auto welcome messages, 
than these messages is going to be taken as entry points, if the user do not specify this parameter.
(see `--numberOfWelcomeMessages` parameter)

    $ botium-crawler-cli crawler-run --config ./botium.json --entryPoints 'Good Morning' 'Next conversation'
    
**--numberOfWelcomeMessages**

You have to specify the number of auto welcome messages exactly, because the crawler has to wait for these welcome messages
before each conversation. By default this is 0. 
If the bot has auto welcome messages, each generated conversation will start with the auto welcome messages.

    $ botium-crawler-cli crawler-run --config ./botium.json --numberOfWelcomeMessages 2
  
**--depth**

You can specify the depth of the crawling, by default it is 5.

    $ botium-crawler-cli crawler-run --config ./botium.json --depth 3
  
**--ignoreSteps**

You can specify here the array of messages has to be ignore during the crawling process.

    $ botium-crawler-cli crawler-run --config ./botium.json --ignoreSteps 'this message is ignored'
    
**--incomprehension**

You can specify here the array of messages, which has to be considered during incomprehension validation.
The result of the validation is going to be stored in `error.log` file in the `output` folder.
    
    $ botium-crawler-cli crawler-run --config ./botium.json --incomprehension 'Unkown command'

**--mergeUtterances**

Setting this flag `true` the same bot answers are going to be merged in one utterance file.
By default the flag is `true` to avoid high number of utterance files.

    $ botium-crawler-cli crawler-run --config ./botium.json --mergeUtterances false

**--recycleUserFeedback**

When the crawler stuck at a point in the conversation, before `depth` is reached,
then the crawler is able to ask the user for answers. 
If this flag is true, then these feedbacks are going to be stored in `userFeedback.json` file in the `output` folder,
and these answers are automatically used during the next run of the crawler.
By default the flag is `true`. 

    $ botium-crawler-cli crawler-run --config ./botium.json --recycleUserFeedback false

##### Example of crawler-run usage

In this example the botium echo connector will be used, 
which basically just echoing back what you say. 
My `botium.json` configuration file looks like this:

```
{
  "botium": {
    "Capabilities": {
      "SCRIPTING_MATCHING_MODE": "wildcardIgnoreCase",
      "CONTAINERMODE": "echo"
    },
    "Envs": {}
  }
}
```

Keeping it simple I set just 'hi' as entry points. 
The commandline will look like this: 

```
$ botium-crawler-cli crawler-run --config ./botium.json --entryPoints 'hi'                                                         ✔  718  15:09:37
Crawler started...

---------------------------------------

    hi

#me
hi

#bot
You said: hi

    
---------------------------------------

This path is stucked before reaching depth. 
Would you like to continue with your own answers?  [yes, no, no all]: yes
Enter your 1. answer: I said hi   
Do you want to add additional answers? [y/n]: n

---------------------------------------

    hi_I said hi

#me
hi

#bot
You said: hi

#me
I said hi

#bot
You said: I said hi

    
---------------------------------------

This path is stucked before reaching depth. 
Would you like to continue with your own answers?  [yes, no, no all]: no
Saving testcases...
The 'crawler-result/scripts/1.1_HI_I-SAID-HI.convo.txt' file is persisted
Crawler finished successfully
```

The `crawler-result` folder will look like this:
```
crawler-result
    ├── scripts
    │   ├── 1.1_HI_I-SAID-HI.convo.txt
    │   ├── UTT_1.1_HI_I-SAID-HI_BOT_1.utterances.txt
    │   └── UTT_1.1_HI_I-SAID-HI_BOT_2.utterances.txt
    └── userFeedback.json

```

In the next run nothing is asked from the user, 
because the previous feedbacks are stored in `userFeedback.json`. 
(Before next run the `crawler-result/scripts` folder has to be emptied.)
So now the commandline much simpler than at the previous run:

```
$ botium-crawler-cli crawler-run --config ./botium.json --entryPoints 'hi'                                                         ✔  719  15:13:17
Crawler started...
Saving testcases...
The 'crawler-result/scripts/1.1_HI_I-SAID-HI.convo.txt' file is persisted
Crawler finished successfully
```

#### crawler-feedbacks command

With crawler-feedback command you can edit (`add`, `remove`, `overwrite`) your stored feedbacks in `userFeedback.json`.

    $ botium-crawler-cli crawler-feedback --help

**--input**

You can specify the path of the json file, where the user feedbacks are stored.
By default it reads the `./crawler-result/userFeedback.json` if it exits.

**--output**

You can specify the output path, where the edited feedback has to be stored.
By default it is the same as input, so basically the input file is going to be overwritten.

##### Example of crawler-feedbacks usage

In this example I will edit in the previous example stored `userFeedback.json` file.
I will overwrite the previously set `I said hi` answer with `I said hello` and then skip the rest:

```
$ botium-crawler-cli crawler-feedbacks                                                                                             ✔  730  15:55:19

---------------------------------------
hi

#me
hi

#bot
You said: hi

    
---------------------------------------

User answers:
1: I said hi


What would you like to do with these answers? [add, remove, overwrite, skip, skip all]: overwrite
Enter your 1. answer: I said hello
Do you want to add additional answers? [y/n]: n

---------------------------------------
hi_I said hi

#me
hi

#bot
You said: hi

#me
I said hi

#bot
You said: I said hi

    
---------------------------------------

User answers:


What would you like to do with these answers? [add, remove, overwrite, skip, skip all]: skip
Edit finished, exiting... Do you want to save your modifications? [y/n]: y
```

Now if I run again the crawler from the previous crawler-run example,
then the `crawler-result` folder will look like this:

    $ botium-crawler-cli crawler-run --config ./botium.json --entryPoints 'hi'

```
crawler-result
    ├── scripts
    │   ├── 1.1_HI_I-SAID-HELLO.convo.txt
    │   ├── UTT_1.1_HI_I-SAID-HELLO_BOT_1.utterances.txt
    │   └── UTT_1.1_HI_I-SAID-HELLO_BOT_2.utterances.txt
    └── userFeedback.json
```

## Using as library

The Botium Crawler is publishing a `Crawler` and a `ConvoHandler`. 
See the an example of usage under `samples/api` folder.

#### Crawler

The `Crawler` need an initialized `BotiumDriver` from Botium Core or a `config` parameter, 
which is a json object with the corresponding `Capabilities`.
Two callback function can be passed as well. 
The first for ask user to give feedback for the stucked conversations.
The second for validating bot answers.
You can find example for these callback functions in the sample code as well.

The `Crawler` has a `crawl` function, with that the crawling process can be triggered. 
This function parameters are identical with the CLI parameters.

    `crawl ({ entryPoints = [], numberOfWelcomeMessages = 0, depth = 5, ignoreSteps = [] })`

#### ConvoHandler

The `ConvoHandler` can decompile the result of the `crawl` function with `decompileConvos` function.
The `decompileConvos` function result is an object with a `scriptObjects` array 
and a `generalUtterances` array property. See in the sample code.
