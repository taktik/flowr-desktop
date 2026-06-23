import * as Ffmpeg from '@taktik/fluent-ffmpeg'
import * as ffmpegPath from 'ffmpeg-static'
import { Readable, Writable } from 'stream'
import { resolve } from 'path'
import { app } from 'electron'
import { PlayerError, PlayerErrors } from './playerError'
import { getLogger } from '../logging/loggers'
import Mp4Parser from './parsers/mp4'
import SimpleParser from './parsers/simple'
import FfmpegParser from './parsers/abstract'
import { IStreamerConfig } from '../interfaces/ipcStreamerConfig'

import type { FfmpegCommandBuilder, FfmpegParserConstructor, FfmpegPipelinesParams, IFfmpegCommandWrapper } from './types'

function handleError(
  callback: (error: PlayerError) => void,
): (err: Error, stdout: string, stderr: string | undefined) => void {
  return (err, stdout, stderr) => {
    const message = `_________err ${new Date().toISOString()}: ${err.message}, ${stdout} ${stderr}`
    let playerError: PlayerErrors
    if (message.includes('Conversion failed')) {
      playerError = PlayerErrors.CONVERSION
    } else if (message.includes('Stream specifier')) {
      playerError = PlayerErrors.ERRONEOUS_STREAM
    } else if (message.includes('SIGKILL') || message.includes('SIGTERM') || message.includes('Exiting normally, received signal 15')) {
      playerError = PlayerErrors.TERMINATED
    } else {
      playerError = PlayerErrors.UNKNOWN
    }
    callback(new PlayerError(message, playerError))
  }
}

const log = getLogger('FlowrFfmpeg')

// ffmpeg-static returns null when no binary exists for the current platform/arch.
// Without this guard, resolve() crashes with "paths[1] must be of type string" on unsupported platforms.
if (ffmpegPath) {
  Ffmpeg.setFfmpegPath(resolve(app.getAppPath(), ffmpegPath))
} else {
  log.warn('ffmpeg-static binary not found for this platform/arch. ffmpeg features will not be available.')
}

/**
 * The container formats we use as ffmpeg's outputs
 */
enum OutputFormat {
  MP4 = 'mp4',
  MP3 = 'mp3',
}

/**
 *
 * @param {OutputFormat} format
 * @returns
 */
function getOutputParserForFormat(format: OutputFormat): FfmpegParserConstructor {
  switch (format) {
    case OutputFormat.MP4:
      return Mp4Parser
    default:
      return SimpleParser
  }
}

/**
 * Wrapper around the actual ffmpeg command and the output data parser
 */
class FfmpegCommandWrapper implements IFfmpegCommandWrapper {
  constructor(
    private readonly ffmpegCommand: Ffmpeg.FfmpegCommand,
    private readonly ffmpegOutput: FfmpegParser,
  ) {
    ffmpegCommand.pipe(ffmpegOutput)
  }

  pipe<T extends Writable>(stream: T, options?: { end?: boolean }): T {
    return this.ffmpegOutput.pipe(stream, options)
  }

  unpipe<T extends Writable>(stream: T): this {
    this.ffmpegOutput.unpipe(stream)
    return this
  }

  kill(): void {
    this.ffmpegCommand?.kill('SIGKILL')
  }
}

function makePipelineBuilder(command: Ffmpeg.FfmpegCommand, format: OutputFormat): FfmpegCommandBuilder {
  const Parser = getOutputParserForFormat(format)

  return (parserConfig: IStreamerConfig) => new FfmpegCommandWrapper(command.format(format), new Parser(parserConfig))
}

function getAudioMpegtsPipeline(
  input: string | Readable,
  errorHandler: (error: PlayerError) => void,
): FfmpegCommandBuilder {
  const command = Ffmpeg(input, { logger: log })
    .on('start', (commandLine: string) => {
      log.info('Spawned Ffmpeg with command:', commandLine)
    })
    .on('error', handleError(errorHandler))

  return makePipelineBuilder(command, OutputFormat.MP3)
}

function getVideoPipeline({
  input,
  audioPid,
  subtitlesPid,
  deinterlace = false,
  errorHandler,
}: FfmpegPipelinesParams): FfmpegCommandBuilder {
  const audioStreamSelector = audioPid ? `i:${audioPid}` : '0:a:0'
  const command = Ffmpeg(input, { logger: log })
    .inputOptions('-probesize 1000k')
    .outputOption('-preset ultrafast')
    .outputOption('-tune zerolatency')
    .outputOption('-g 30')
    .outputOption('-r 30')
    .outputOption(`-map ${audioStreamSelector}?`)
    .outputOption('-async 1')

  if (subtitlesPid) {
    const deinterlacingFilter = deinterlace ? ',yadif' : ''

    command
      .outputOption(`-filter_complex [0:v][i:${subtitlesPid}]overlay${deinterlacingFilter}[v]`)
      .outputOption('-map [v]')
  } else {
    if (deinterlace) {
      command.videoFilter('yadif')
    }

    command.outputOption('-map 0:v')
  }

  if (process.platform !== 'darwin') {
    command.outputOption('-flush_packets -1')
  }

  command
    .outputOption(
      '-movflags empty_moov+frag_keyframe+default_base_moof+disable_chpl',
    )
    .outputOption('-c:v libx264')
    .on('start', (commandLine: string) => {
      log.info('Spawned Ffmpeg with command: ', commandLine)
    })
    .on('error', handleError(errorHandler))

  return makePipelineBuilder(command, OutputFormat.MP4)
}

export {
  getAudioMpegtsPipeline,
  getVideoPipeline,
}

export type {
  FfmpegCommandWrapper
}
