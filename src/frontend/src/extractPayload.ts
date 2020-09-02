import { PacketData } from 'mpegts-tools'
import { Transform, TransformCallback } from 'stream'

export class ExtractPayload extends Transform {
    // tslint:disable-next-line: function-name
  _transform(chunk: Buffer, encoding: BufferEncoding, callback: TransformCallback) {
    try {
      const packet = new PacketData(chunk)
      if (packet.payload) callback(null, packet.payload)
    } catch (e) {
      callback(e)
    }
  }
}
