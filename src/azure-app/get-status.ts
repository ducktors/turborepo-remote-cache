import { app } from '@azure/functions'
import { handler } from '../azure-function.js'

app.http('GetArtifactStatus', {
  route: 'artifacts/status',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: handler,
})
