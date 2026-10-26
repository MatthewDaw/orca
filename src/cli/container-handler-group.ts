import type { HandlerGroup } from './handler-group-manifest'

export const CONTAINER_HANDLER_GROUP: HandlerGroup = {
  name: 'container',
  keys: [
    'container list',
    'container context',
    'container message',
    'container brief',
    'container scope',
    'container create',
    'container rm',
    'container agents',
    'container close-agent',
    'container launch'
  ],
  load: async () => (await import('./handlers/container.js')).CONTAINER_HANDLERS
}
