import { Store } from './store'
import { ipcMain, IpcMainEvent, app } from 'electron'
import { IpcStreamer } from './ipcStreamer'
import { ITsDecryptorConfig, TsDecryptor } from '@taktik/ts-decryptor'
import { UdpStreamer, UdpStreamerError, UdpStreamerErrors } from '@taktik/udp-streamer'
import { ICurrentStreams } from './interfaces/currentStreams'
import { IStreamTrack } from './interfaces/streamTrack'
import { PlayerError, PlayerErrors } from './playerError'
import { FlowrFfmpeg } from './ffmpeg'
import { Readable, Writable, Stream, PassThrough } from 'stream'
import { IDecryption } from './interfaces/storedDecryption'
import Ffmpeg = require('fluent-ffmpeg')
import { IPlayerStreams } from './interfaces/playerPipeline'
import { IPlayerStore } from './interfaces/playerStore'
import { DEFAULT_PLAYER_STORE } from './playerStore'
import { IStreamerConfig } from './interfaces/ipcStreamerConfig'
import { ICircularBufferConfig } from '@taktik/buffers'
import { Dispatcher } from './dispatcher'
import { ChildProcess } from 'child_process'
import { storeManager } from '../../launcher'
import { IFlowrStore } from './interfaces/flowrStore'

export class Player {
  private streams?: IPlayerStreams
  private currentStreams?: ICurrentStreams
  private readonly _ipcEvents: {[key: string]: (...args: any[]) => void}
  private udpStreamer: UdpStreamer | null = null
  private decryptor: TsDecryptor | null = null
  private dispatcher: Dispatcher | null = null
  private streamer: IpcStreamer | null = null
  private replayOnErrorTimeout: number | null = null
  private stopping: Promise<void> = Promise.resolve()
  private flowrFfmpeg: FlowrFfmpeg = new FlowrFfmpeg()
  private ffprobeProcess?: ChildProcess
  private store: Store<IPlayerStore> = this.initStore()

  get ipcStreamerConfig(): IStreamerConfig {
    return this.store.get('streamer')
  }

  get decryption(): IDecryption {
    return this.store.get('decryption')
  }

  get tsDecryptorConfig(): ITsDecryptorConfig {
    return this.store.get('tsDecryptor')
  }

  get udpStreamerConfig(): ICircularBufferConfig {
    return this.store.get('udpStreamer')
  }

  constructor(private flowrStore: Store<IFlowrStore>) {
    this._ipcEvents = {
      closestream: this.closestream.bind(this),
      pausestream: this.pausestream.bind(this),
      resumestream: this.resumestream.bind(this),
      getaudiostream: this.getaudiostream.bind(this),
      getSubtitleStreams: this.getSubtitleStreams.bind(this),
      setaudiostream: this.setaudiostream.bind(this),
      setsubtitlestream: this.setsubtitlestream.bind(this),
      typeofstream: this.typeofstream.bind(this),
      openurl: this.openUrl.bind(this),
      FlowrIsInitializing: this.stop.bind(this),
    }
    Object.entries(this._ipcEvents).forEach(event => ipcMain.on(event[0], event[1]))
  }

  initStore(): Store<IPlayerStore> {
    const shouldPersist = !storeManager.exists('player')
    const store = storeManager.createStore<IPlayerStore>('player', DEFAULT_PLAYER_STORE)

    if (shouldPersist) {
      store.persist()
    } else if (store.get('version') !== app.getVersion()) {
      store.reset(DEFAULT_PLAYER_STORE)
    }

    return store
  }

  updateChannelData(streams: ICurrentStreams) {
    const channelData = this.flowrStore.get('channelData')
    channelData[streams.url] = streams
    this.flowrStore.set('channelData', channelData)
  }

  closestream(evt: IpcMainEvent) {
    this.stop()
    evt.sender.send('streamclosed')
  }

  pausestream(evt: IpcMainEvent) {
    evt.sender.send('streampaused')
  }

  resumestream(evt: IpcMainEvent) {
    evt.sender.send('streamresumed')
  }

  getaudiostream(evt: IpcMainEvent) {
    const audio = (this.currentStreams) ? this.currentStreams.audio : {}
    evt.sender.send('audiostreams', audio)
  }

  getSubtitleStreams(evt: IpcMainEvent) {
    const subtitles = (this.currentStreams) ? this.currentStreams.subtitles : {}
    evt.sender.send('subtitleStreams', subtitles)
  }

  async setaudiostream(evt: IpcMainEvent, selectedAudioStream: number) {
    if (this.currentStreams) {
      // retrieve proper
      this.currentStreams.audio.currentStream = selectedAudioStream
      await this.replay(this.currentStreams.url, this.currentStreams, evt)
      this.updateChannelData(this.currentStreams)
    }
  }

  async setsubtitlestream(evt: IpcMainEvent, selectedSubtitleStream: number) {
    if (this.currentStreams) {
      // retrieve proper
      if (selectedSubtitleStream !== this.currentStreams.subtitles.currentStream) {
        this.currentStreams.subtitles.currentStream = selectedSubtitleStream
        await this.replay(this.currentStreams.url, this.currentStreams, evt)
        this.updateChannelData(this.currentStreams)
      }
    }
  }

  /**
   * Using ffprobe, retrieve the type of stream (audio or video)
   * This function is deprecated because it requires the frontend to make several calls through ipc
   * This complexifies the playback flow, when all could be done in openUrl
   * To be removed in flowr-desktop v2
   * @param evt Original event
   * @param url URL of the stream to check
   * @deprecated
   */
  async typeofstream(evt: IpcMainEvent, url: string) {
    const sendTypeOfStream = (stream: ICurrentStreams) => {
      if (stream.video?.tracks?.length > 0) {
        // is video
        evt.sender.send('typeofstream', 'video')
      } else if (stream.audio?.tracks?.length > 0) {
        // is audio
        evt.sender.send('typeofstream', 'audio')
      }
    }

    // Attempt to find cached data for the given url
    const channelData = this.flowrStore.get('channelData')
    const stream = channelData[url]
    // If we already have info for this url, return immediately...
    if (stream) {
      sendTypeOfStream(stream)
    } else {
      // ...else retrieve metadata using ffprobe
      try {
        await this.stopping
        const pipeline = await this.getStreamingPipeline(url)
        const metadata = await this.retrieveMetadata(pipeline)
        this.currentStreams = this.processStreams(metadata.streams, url)
        this.updateChannelData(this.currentStreams)
        await this.stop()
        sendTypeOfStream(this.currentStreams)
      } catch (e) {
        if (e instanceof PlayerError && e.code === PlayerErrors.TERMINATED) {
          // silence
          return
        }
        console.log('ffprobe failure:', e)
      }
    }
  }

  /**
   * This function is called upon receiving an "openurl" message through ipc
   * @param {IpcMainEvent} evt original event
   * @param {string} url url to play
   */
  async openUrl(evt: IpcMainEvent, url: string): Promise<void> {
    try {
      console.log('----------- openUrl', url)
      await this.stopping

      const pipeline = await this.getStreamingPipeline(url)

      // Attempt to find cached data for the given url
      const channelData = this.flowrStore.get('channelData')
      const localCurrentStream: ICurrentStreams | undefined = channelData[url]

      // If we already have info for this url, play it immediately...
      if (localCurrentStream) {
        this.currentStreams = localCurrentStream
        await this.playUrl(pipeline, localCurrentStream, evt)
      }
      // ... else wait before retrieving ffprobe metadata
      try {
        const metadata: Ffmpeg.FfprobeData = await this.retrieveMetadata(pipeline)
        const newStreamData: ICurrentStreams = this.processStreams(metadata.streams, url)
        const shouldReplay: boolean = this.hasStreamChanged(newStreamData, localCurrentStream)

        if (this.currentStreams && this.currentStreams.url === localCurrentStream?.url) {
          // We are playing the same content, reuse the audio and subtitles
          const currentAudioStream = this.currentStreams.audio.currentStream
          if (newStreamData.audio.tracks.some(track => track.pid === currentAudioStream)) {
            newStreamData.audio.currentStream = currentAudioStream
          }
          const currentSubtitleStream = this.currentStreams.subtitles.currentStream
          if (newStreamData.subtitles.tracks.some(track => track.pid === currentSubtitleStream)) {
            newStreamData.subtitles.currentStream = currentSubtitleStream
          }

          this.currentStreams = newStreamData
          this.updateChannelData(newStreamData)
          if (shouldReplay) {
            await this.replay(newStreamData.url, newStreamData, evt)
          }
        }
      } catch (e) {
        if (e instanceof PlayerError && e.code === PlayerErrors.TERMINATED) {
          // silence
          return
        }
        console.error('Error when updating stream data:', e)
      }
    } catch (e) {
      console.error('Failed to open url:', e)
    }
  }

  stop(shouldFlush: boolean = false): Promise<void> {
    return this.stopping = this.stopping
      .then(() => new Promise(async resolve => {
        try {
          this.ffprobeProcess?.kill('SIGKILL')
          if (this.replayOnErrorTimeout) {
            clearTimeout(this.replayOnErrorTimeout)
          }
          if (this.udpStreamer) {
            await this.udpStreamer.close()
          }
          this.dispatcher?.clear()
          if (this.streams) {
            await this.terminateStreams(this.streams)
            this.streams = undefined
          }
          this.streamer?.clear(shouldFlush)
        } catch (e) {
          console.error('An error occurred while stopping:', e)
        } finally {
          resolve()
        }
      }))
  }

  async terminateStreams(streams: IPlayerStreams): Promise<void> {
    if (streams.input instanceof Stream) {
      await this.destroyStream(streams.input)
    }
  }

  destroyStream(stream: Readable | Writable): Promise<void> {
    return new Promise((resolve) => {
      stream.on('close', resolve)
      stream.destroy()
    })
  }

  /**
   * Spawn an ffprobe process to retrieve stream metadata
   * @param input Stream input to use, either a string to be passed to ffmpeg or a Readable stream
   */
  async retrieveMetadata(input: string | Dispatcher): Promise<Ffmpeg.FfprobeData> {
    let ffprobeInput: string | Readable

    if (input instanceof Dispatcher) {
      ffprobeInput = input.pipe(new PassThrough())
    } else {
      ffprobeInput = input
    }
    try {
      const { process, data } = await this.flowrFfmpeg.ffprobe(ffprobeInput, { timeout: 30 })
      this.ffprobeProcess = process
      const ffprobeData = await data
      return ffprobeData
    } catch (e) {
      let errorCode = PlayerErrors.UNKNOWN

      // If message contains SIGKILL, we terminated the process on purpose
      if (e.message.includes('SIGKILL')) {
        errorCode = PlayerErrors.TERMINATED
      }
      throw new PlayerError(e.message, errorCode)
    } finally {
      // Destroy input if we passed a stream (not a string)
      this.ffprobeProcess = undefined
      if (ffprobeInput instanceof Readable) {
        await this.destroyStream(ffprobeInput)
      }
    }
  }

  /**
   * Finds out if the current audio/video/subtitle tracks we are playing still exist with the newest metadata
   * @param newStreamData Most recently retrieved stream metadata
   * @param localCurrentStream Cached stream metadata
   */
  hasStreamChanged(newStreamData: ICurrentStreams, localCurrentStream: ICurrentStreams | undefined): boolean {
    const isSameUrlButDifferentCodec: boolean = !!this.currentStreams &&
        this.currentStreams.url === localCurrentStream?.url &&
        this.currentStreams.video.tracks[0]?.codecName !== newStreamData.video.tracks[0]?.codecName
    const audioStreamExists = this.currentStreams?.audio.currentStream === -1 ||
        newStreamData.audio.tracks.some(track => track.pid === this.currentStreams?.audio.currentStream)
    const subtitlesStreamExists = this.currentStreams?.subtitles.currentStream === -1 ||
        newStreamData.subtitles.tracks.some(track => track.pid === this.currentStreams?.subtitles.currentStream)
    // If nothing is playing
    return !localCurrentStream ||
        // or if currently playing stream video track's codec name is different than the newly fetched one
        isSameUrlButDifferentCodec ||
        // or if current audio/subtitle streams do not exist anymore
        !audioStreamExists || !subtitlesStreamExists
  }

  async attemptReplay(evt: IpcMainEvent) {
    if (this.currentStreams) {
      // if conversion error, keep trying
      // replay will kill previous process
      await this.replay(this.currentStreams.url, this.currentStreams, evt)
    }
  }

  async handleErroneousStreamError(evt: IpcMainEvent) {
    if (this.currentStreams) {
      // reset to default audio and subtitles and try again
      this.currentStreams.audio.currentStream = (this.currentStreams.audio.tracks.length > 0) ? this.currentStreams.audio.tracks[0].pid : -1
      this.currentStreams.subtitles.currentStream = -1
      await this.replay(this.currentStreams.url, this.currentStreams, evt)
    }
  }

  getErrorHandler(evt: IpcMainEvent) {
    return (error: PlayerError) => {
      switch (error.code) {
        case PlayerErrors.ERRONEOUS_STREAM:
          this.handleErroneousStreamError(evt)
          break
        case PlayerErrors.TERMINATED:
          // silence this, most probably we terminated the process on purpose
          break
        case PlayerErrors.CONVERSION:
        default:
          console.error('Player error', error)
          this.attemptReplay(evt)
      }
    }
  }

  async connectUdpStreamer(url: string): Promise<Readable> {
    // lazy instantiate if necessary
    const udpStreamer = this.udpStreamer || (this.udpStreamer = new UdpStreamer(this.udpStreamerConfig))
    const cleanUrl = url
        .replace(/\s/g, '') // remove whitespaces
        .replace(/(udp|rtp):\/\/@?(.+)/, '$2') // retrieve ip:port
    const ip = cleanUrl.split(':')[0]
    const port = parseInt(cleanUrl.split(':')[1], 10)
    try {
      return udpStreamer.connect(ip, port)
    } catch (e) {
      if (e instanceof UdpStreamerError && e.code === UdpStreamerErrors.CONNECTED) {
        // retry if streamer was already connected
        await this.stop()
        return udpStreamer.connect(ip, port)
      }
      throw e
    }
  }

  getDecryptionPipeline(stream: Readable): Dispatcher {
    // lazy instantiate if necessary
    const decryptor = this.decryptor || (this.decryptor = new TsDecryptor(this.tsDecryptorConfig))
    if (this.dispatcher) {
      // TsDecryptor has already been piped to Dispatcher
      decryptor.injest(stream)
      return this.dispatcher
    }
    return this.dispatcher = decryptor
      .injest(stream)
      .pipe(new Dispatcher())
  }

  async getStreamingPipeline(url: string): Promise<string | Dispatcher> {
    let input: string | Dispatcher

    if (this.decryption.use) {
      input = this.getDecryptionPipeline(await this.connectUdpStreamer(url))
    } else {
      input = url
    }

    return input
  }

  getStreamInput(input: string | Dispatcher): string | Readable {
    let playInput: string | Readable

    if (input instanceof Dispatcher) {
      playInput = input.pipe(new PassThrough())
    } else {
      playInput = input
    }

    return playInput
  }

  async playUrl(urlOrDispatcher: string | Dispatcher, streamToPlay: ICurrentStreams, evt: IpcMainEvent) {
    if (this.replayOnErrorTimeout) {
      clearTimeout(this.replayOnErrorTimeout)
    }
    let input: Readable

    if (urlOrDispatcher instanceof Dispatcher) {
      input = urlOrDispatcher.pipe(new PassThrough())
    } else {
      input = await this.connectUdpStreamer(urlOrDispatcher)
    }

    const streamer = this.streamer || (this.streamer = new IpcStreamer(this.ipcStreamerConfig))
    streamer.sender = evt.sender
    input.pipe(streamer, { end: false })
    this.streams = { input }

    if (input instanceof Readable) {
      input.on('error', async (error: Error) => {
        console.error('------------- Error in play pipeline -------------')
        console.error(error)
        console.error('------------- ---------------------- -------------')
        this.replayOnErrorTimeout = setTimeout(async () => this.replay(streamToPlay.url, streamToPlay, evt), 200)
      })
    }
  }

  async replay(url: string, streamToPlay: ICurrentStreams, evt: IpcMainEvent) {
    await this.stop(true)
    const pipeline = await this.getStreamingPipeline(url)
    await this.playUrl(pipeline, streamToPlay, evt)
  }

  processStreams (streams: Ffmpeg.FfprobeStream[], url: string): ICurrentStreams {
    const audioTracks: IStreamTrack[] = streams
        .filter((stream: Ffmpeg.FfprobeStream) => stream.codec_type === 'audio')
        .map((stream: Ffmpeg.FfprobeStream, index: number) => ({
          index,
          code: (stream.tags?.language === '???') ? 'zzz' : stream.tags?.language,
          pid: stream.index,
          codecName: stream.codec_name,
        }),
      )

    const subtitleTracks: IStreamTrack[] = streams
        .filter((stream: Ffmpeg.FfprobeStream) => stream.codec_type === 'subtitle')
        .map((stream: Ffmpeg.FfprobeStream, index: number) => ({
          index,
          code: (stream.tags?.language === '???') ? 'zzz' : stream.tags?.language,
          pid: stream.index,
          codecName: stream.codec_name,
        }),
      )

    const videoTracks: IStreamTrack[] = streams
        .filter((stream: Ffmpeg.FfprobeStream)  => stream.codec_type === 'video')
        .map((stream: Ffmpeg.FfprobeStream, index: number) => ({
          index,
          pid: stream.index,
          codecName: stream.codec_name,
        }),
      )

    return {
      url,
      video: { tracks: videoTracks },
      audio: {
        tracks: audioTracks,
        currentStream: (audioTracks.length > 0) ? audioTracks[0].pid : -1,
      },
      subtitles: {
        tracks: subtitleTracks,
        currentStream: -1,
      },
    }
  }

  close() {
    this.stop()
    Object.entries(this._ipcEvents).forEach(event => ipcMain.removeListener(event[0], event[1]))
  }
}
