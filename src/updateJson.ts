export type UpdateInfo = {
  signature: string
  minimumVersion: string
  version: string
  size: number
}

export type UpdateJSON = UpdateInfo & {
  beta: UpdateInfo
}

export function isUpdateJSON(json: any): json is UpdateJSON {
  const is = (j: any) => !!(j && j.minimumVersion && j.signature && j.size && j.version)
  return is(json) && is(json?.beta)
}
