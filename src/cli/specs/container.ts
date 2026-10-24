import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const CONTAINER_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['container', 'list'],
    summary: 'List Orca containers and their parent worktrees',
    usage: 'orca container list [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: ['Reads the container catalog Orca keeps in ~/.orca/containers.'],
    examples: ['orca container list', 'orca container list --json']
  },
  {
    path: ['container', 'context'],
    summary: 'Print the context page for a container: its main focus and how it connects to others',
    usage: 'orca container context [--name <container>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'name'],
    notes: [
      'Without --name, prints the page for the container this terminal runs in (from ORCA_CONTAINER_CONTEXT).',
      'Read this at the start of a session to learn your focus and which other containers you work with.'
    ],
    examples: ['orca container context', 'orca container context --name "API"']
  }
]
