import fp from 'fastify-plugin'
import { type Config, load } from '../env.js'

export default fp<{ overrides?: Partial<Config> }>(
  async (fastify, { overrides }) => {
    fastify.decorate('config', load(overrides))
  },
  { name: 'config' },
)

declare module 'fastify' {
  interface FastifyInstance {
    config: Config
  }
}
