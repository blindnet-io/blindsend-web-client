const apiVersion = VERSION.split('.').slice(0, 2).join('.')

export const endpoint = (HOST != null) ? `${HOST}/v${apiVersion}` : `/v${apiVersion}`

export const encryptionChunkSize = 131072

export const uploadChunkSize = 4194304

export const fullUploadLimit = 4194304