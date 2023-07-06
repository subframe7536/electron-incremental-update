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
  const is = (j: any) => 'signature' in j && 'version' in j && 'size' in j && 'minimumVersion' in j
  return is(json) && 'beta' in json && is(json.beta)
}
