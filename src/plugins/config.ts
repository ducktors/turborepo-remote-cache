import fp from 'fastify-plugin'
import { env } from '../env'

export default fp(
  async function (fastify) {
    fastify.decorate('config', env)
  },
  { name: 'config' },
)

declare module 'fastify' {
  interface FastifyInstance {
    config: typeof env
  }
}
