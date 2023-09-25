import { createApp } from '../dist/app.js'

const app = createApp()

export default async function (req, res) {
  await app.ready()
  app.server.emit('request', req, res)
}
