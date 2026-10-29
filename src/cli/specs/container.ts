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
      "The message goes to the target container's default conversation (marked in its tab strip), or its first agent terminal when it has no default open. --agent picks another conversation: give the agent name (codex, claude, ...) or words from the tab title of the conversation, and the best title match wins. Only pass --agent when you have a clear reason to reach a conversation other than the default. Run `orca container agents --container <path>` to see the titles.",
      'If the container has no conversation open, its default conversation is resumed with your message, or a new Claude session is started with it when it never had one.',
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
  },
  {
    path: ['container', 'create'],
    summary: 'Create a child container under this container (or another one)',
    usage:
      'orca container create --name <name> [--parent <container>] [--focus <text>] [--new-worktree [--repo <selector>|--project <id-or-name>] [--base-branch <ref>]] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'name',
      'parent',
      'focus',
      'new-worktree',
      'repo',
      'project',
      'base-branch'
    ],
    notes: [
      "The child lives on the parent's worktree, starts with no tabs, and inherits the parent's scope and brief.",
      "Without --parent, uses this terminal's container (ORCA_CONTAINER_ID). Names must be unique among siblings, and a container can have at most 12 children.",
      "From a terminal in a worktree's own space (no container), the new container is created at the top level of that worktree.",
      "--new-worktree instead creates a new git worktree (inheriting this repo unless --repo or --project is given) and does not nest it. A worktree's own space is itself a container: reach it with `worktree:<id>` or its name, start sessions in it with `orca container launch`. Without --new-worktree the container always lives on the current worktree.",
      "--focus sets the child's one-line main focus. A person (or you, via `orca container message`) still has to open an agent in it."
    ],
    examples: [
      'orca container create --name "court-overlay" --focus "Render the court overlay for basketball"',
      'orca container create --parent "computer_vision/basketball" --name "shot-arc"',
      'orca container create --new-worktree --name "cloud-audit"'
    ]
  },
  {
    path: ['container', 'rm'],
    aliases: [['container', 'delete']],
    summary: 'Delete a container nested under this one, closing its tabs and agent sessions',
    usage: 'orca container rm --container <container> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'container'],
    notes: [
      'Only containers nested under yours can be deleted; never your own or an ancestor. Open tabs and agent sessions in the deleted container are closed, and containers nested inside it move up a level.',
      'There is no confirmation prompt and no undo, so delete only what you created or were told to remove.'
    ],
    examples: ['orca container rm --container "computer_vision/basketball/shot-arc"']
  },
  {
    path: ['container', 'launch'],
    summary: 'Start a new agent session (Claude, Codex, ...) inside a container',
    usage:
      'orca container launch --agent <name> [--container <container>] [--prompt <text>] [--permission inherit|default|bypass|manual] [--fresh] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'agent', 'container', 'prompt', 'permission', 'fresh'],
    notes: [
      "Opens a new agent tab in the container without changing the person's selection. Without --container, uses this terminal's container. Any container or worktree space is allowed.",
      "By default the new session starts with the same permission settings as the agent that started it (a bypass stays a bypass, even when a Codex agent starts Claude or the reverse). --permission overrides: default = Orca's normal launch defaults, bypass = skip permission prompts, manual = every action asks.",
      "--prompt is the new session's first message. It is also told to read its container context when it has a parent brief or scope to inherit.",
      'When the container has no Claude or Codex conversation open but has a default conversation, that conversation is resumed (with its own permissions) and --prompt is sent to it instead of starting a new session. Pass --fresh to start a new session anyway.',
      'Once the session is up, hand it work with `orca container message --to <container>`.'
    ],
    examples: [
      'orca container launch --container "computer_vision/basketball/shot-arc" --agent codex --prompt "Build the shot-arc overlay"'
    ]
  },
  {
    path: ['container', 'agents'],
    summary: 'List the open agent sessions in a container with the handles you can close',
    usage: 'orca container agents [--container <container>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'container'],
    notes: [
      "Without --container, lists this terminal's container. Your own session is marked (you)."
    ],
    examples: [
      'orca container agents',
      'orca container agents --container "computer_vision/basketball"'
    ]
  },
  {
    path: ['container', 'close-agent'],
    summary: 'Close one agent session in your container or one nested under it',
    usage: 'orca container close-agent --terminal <handle> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'terminal'],
    notes: [
      'Get the handle from `orca container agents`. Closes the whole tab and ends the session; you cannot close your own.',
      'Works for any agent type, so a codex agent can close a claude one and the reverse.'
    ],
    examples: ['orca container close-agent --terminal term_abc123']
  }
]
