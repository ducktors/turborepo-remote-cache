import { app } from '@azure/functions'
import { handler } from '../azure-function.js'

app.http('PutArtifact', {
  route: 'artifacts/{id}',
  methods: ['PUT'],
  authLevel: 'anonymous',
  handler: handler,
})
