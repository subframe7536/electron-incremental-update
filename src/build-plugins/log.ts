import { createLogger } from 'vite'
import { bytecodeId, id } from './constant'

export const log = createLogger('info', { prefix: `[${id}]` })

export const bytecodeLog = createLogger('info', { prefix: `[${bytecodeId}]` })
