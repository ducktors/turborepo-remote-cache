import { createApp } from './app'

const app = createApp()

export default async (req, res) => {
  await app.ready()
  app.server.emit('request', req, res)
}
