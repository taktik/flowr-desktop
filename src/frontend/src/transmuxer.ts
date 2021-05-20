import { IOutputTrack, mp4 } from '@taktik/mux.js'
import { WebContents } from 'electron'
import { Writable, TransformCallback, Readable } from 'stream'
import { IPipelineTail } from './interfaces/playerPipeline'

export class TransmuxerWrapper extends Writable implements IPipelineTail {
  private _transmuxer = new mp4.Transmuxer({
    remux: true,
  })

  sender?: WebContents
  interval?: number

  constructor() {
    super({ autoDestroy: false })
    this._transmuxer.on('data', this.sendData.bind(this))
    this._transmuxer.on('trackinfo', (trackInfo) => {
      this.sender?.send('trackinfo', trackInfo)
    })
  }

  play(input: Readable, audioPid?: number, subtitlesPid?: number): void {
    input.pipe(this)

    if (audioPid) {
      this.setAudioTrackFromPid(audioPid)
    }
  }

  // tslint:disable-next-line: function-name
  _write(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) {
    try {
      this._transmuxer.push(chunk)

      if (this._transmuxer.canFlush()) {
        this._transmuxer.flush()
      }
      callback(null)
    } catch (e) {
      callback(e)
    }
  }

  clear(shouldFlush: boolean = false) {
    if (shouldFlush) {
      this._transmuxer.flush()
    }
    this._transmuxer.reset()
  }

  sendData(transmuxOutput: IOutputTrack<'audio' | 'video'>) {
    this.sender?.send('segment', transmuxOutput)
  }

  setAudioTrackFromPid(pid: number) {
    this._transmuxer.setAudioTrackFromPid(pid)
  }
}