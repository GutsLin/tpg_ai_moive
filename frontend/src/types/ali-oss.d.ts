declare module 'ali-oss' {
  export interface OSSClientOptions {
    region: string
    bucket: string
    accessKeyId: string
    accessKeySecret: string
    stsToken?: string
    secure?: boolean
  }

  export interface PutOptions {
    progress?: (progress: number) => Promise<void> | void
  }

  export default class OSS {
    public constructor(options: OSSClientOptions)
    public put(name: string, file: Blob | File, options?: PutOptions): Promise<unknown>
  }
}
