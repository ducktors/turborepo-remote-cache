import { app } from '@azure/functions'
import { handler } from '../azure-function.js'

app.http('GetArtifact', {
  route: 'artifacts/{id}',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: handler,
})
