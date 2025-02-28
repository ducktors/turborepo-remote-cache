import { app } from '@azure/functions'
import { handler } from '../azure-function.js'

app.http('ArtifactsEvents', {
  route: 'artifacts/events',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: handler,
})
