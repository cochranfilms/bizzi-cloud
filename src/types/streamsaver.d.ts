declare module "streamsaver" {
  interface StreamSaver {
    createWriteStream(filename: string, options?: { size?: number }): WritableStream;
    mitm?: string;
  }
  const streamSaver: StreamSaver;
  export default streamSaver;
}
