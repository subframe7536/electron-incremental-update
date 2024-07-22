import zlib from 'node:zlib'

export async function defaultZipFile(buffer: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    zlib.brotliCompress(buffer, (err, buffer) => {
      if (err) {
        reject(err)
      } else {
        resolve(buffer)
      }
    })
  })
}

export async function defaultUnzipFile(buffer: Buffer): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    zlib.brotliDecompress(buffer, (err, buffer) => {
      if (err) {
        reject(err)
      } else {
        resolve(buffer)
      }
    })
  })
}
