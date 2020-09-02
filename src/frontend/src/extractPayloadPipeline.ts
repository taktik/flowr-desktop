import { Align, IAlignConfig, IChunkStreamConfig, ChunkStream } from '@taktik/ts-align'
import { ExtractPayload } from './extractPayload'
import { Readable } from 'stream'

export interface IExtractConfig {
  input: Readable
  alignConfig: IAlignConfig
  chunkStreamConfig: IChunkStreamConfig
}

export function extractPayloadPipeline({ input, alignConfig, chunkStreamConfig }: IExtractConfig): ExtractPayload {
  return input
    .pipe(new Align(alignConfig))
    .pipe(new ChunkStream(chunkStreamConfig))
    .pipe(new ExtractPayload())
}
