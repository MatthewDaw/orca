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
  },
  {
    path: ['container', 'message'],
    summary: "Send a message to another container's agent",
    usage:
      'orca container message --to <container> --text <message> [--agent <name>] [--from <container>] [--exchange <n>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'to', 'text', 'agent', 'from', 'exchange'],
    notes: [
      '--to takes a container id, a path such as "AI Analysis/pickleball" or "computer_vision/basketball", or the words of its path. Paths resolve against the live container tree on every call, so renames and re-nesting never break routing; use the new name after a rename.',
      'The message is typed into the first agent terminal of the target container. --agent picks another by agent name (codex, claude, ...) or terminal title when the container has several.',
      "The recipient sees who sent it and the command to reply. The sender is this terminal's container (ORCA_CONTAINER_ID); pass --from <container> outside a container terminal.",
      'Replies carry --exchange <n>; copy it from the message you are answering. After 8 automatic exchanges the command refuses, so two agents cannot loop forever: stop and summarize for the user.',
      'An ambiguous name lists the matching containers; retry with the full path or the id.'
    ],
    examples: [
      'orca container message --to "AI Analysis/pickleball" --text "How did you handle the court overlay?"',
      'orca container message --to computer_vision/basketball --agent codex --text "Please build the shot-arc feature"'
    ]
  },
  {
    path: ['container', 'scope'],
    summary:
      'Show or set the code scope for this container (the code its agent should stay within)',
    usage: 'orca container scope [--set <text>] [--container <container>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'set', 'container'],
    notes: [
      "This is how to record a container's intended code scope. Never write it into AGENTS.md or CLAUDE.md: those files are shared by every container on the worktree, so the scope would leak into other agents' work.",
      "Nested containers inherit their parents' scope automatically. --set replaces the whole text (max 1000 characters); list directories or modules, not explanations.",
      "Without --container, uses this terminal's container (ORCA_CONTAINER_ID)."
    ],
    examples: [
      'orca container scope',
      'orca container scope --set "src/sports_analysis/court_mapping/, src/sports_analysis/models/, tests/court_mapping/"'
    ]
  },
  {
    path: ['container', 'brief'],
    summary: "Show or replace this container's shared brief for its nested containers",
    usage: 'orca container brief [--set <text>] [--container <container>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'set', 'container'],
    notes: [
      'The brief is markdown that every container nested under this one must read. Keep it short and slow-changing: only durable decisions and conventions, never task progress.',
      '--set replaces the whole brief (rewrite and condense; do not append). It is capped at 2000 characters and agent edits are limited to one per hour.',
      "Without --container, uses this terminal's container (ORCA_CONTAINER_ID)."
    ],
    examples: [
      'orca container brief',
      'orca container brief --set "Use the repository pattern; mock the clock in tests."'
    ]
  }
]
