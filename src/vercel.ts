import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createApp } from './app'

const app = createApp()

export default async function (req: VercelRequest, res: VercelResponse) {
  await app.ready()
  app.server.emit('request', req, res)
}
