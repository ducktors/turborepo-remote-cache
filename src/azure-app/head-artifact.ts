import { app } from '@azure/functions'
import { handler } from '../azure-function.js'

app.http('HeadArtifact', {
  route: 'artifacts/{id}',
  methods: ['HEAD'],
  authLevel: 'anonymous',
  handler: handler,
})
