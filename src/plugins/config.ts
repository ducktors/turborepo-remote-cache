import fp from 'fastify-plugin'
import { Config, load } from '../env.js'

export default fp<{ overrides?: Partial<Config> }>(
  async function (fastify, { overrides }) {
    fastify.decorate('config', load(overrides))
  },
  { name: 'config' },
)

declare module 'fastify' {
  interface FastifyInstance {
    config: Config
  }
}
