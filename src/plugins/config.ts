import fp from 'fastify-plugin'
import { env } from '../env.js'

export default fp(
  async function (fastify) {
    fastify.decorate('config', env.get())
  },
  { name: 'config' },
)

declare module 'fastify' {
  interface FastifyInstance {
    config: ReturnType<typeof env.get>
  }
}
