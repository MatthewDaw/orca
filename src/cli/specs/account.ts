import { GLOBAL_FLAGS, type CommandSpec } from '../args'

// Terminal login lets headless hosts manage accounts without the desktop login UI.
export const ACCOUNT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['account', 'add'],
    summary: 'Add a managed agent account by signing in on this Orca host',
    usage:
      'orca account add [--agent claude|codex|opencode|devin] [--label <name>] [--integration <id>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'agent', 'label', 'integration'],
    notes: [
      'Runs the agent login (`claude login` / `codex login`) in this terminal, then registers the account with the local Orca runtime.',
      'Codex uses device authorization so the browser can complete sign-in from a different machine.',
      'OpenCode 2 uses `opencode auth login --standalone` in private XDG directories. Devin uses `devin auth login --force-manual-token-flow`.',
      'Use --integration <id> to skip the OpenCode integration picker; --label names the saved OpenCode or Devin profile.',
      'OpenCode and Devin profiles apply to new explicit host agent launches. Direct SSH relay and Windows-hosted WSL selection are not supported; run the command on a headless Orca runtime on that host.',
      'Sign in with the account you want to add (e.g. use a private/incognito browser window for a second account).',
      '--agent defaults to claude. Requires the Orca runtime to be running on this machine.'
    ],
    examples: ['orca account add', 'orca account add --agent codex']
  },
  {
    path: ['account', 'list'],
    summary: 'List managed agent accounts on this Orca host',
    usage: 'orca account list [--agent opencode|devin] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'agent'],
    notes: [
      'Lists the accounts on this machine. `--environment` / `--pairing-code` are rejected rather than ignored; run it on the host whose accounts you want to see.'
    ],
    examples: ['orca account list']
  },
  {
    path: ['account', 'push'],
    summary: "Copy this machine's Claude/Codex login to a remote worker over ssh",
    usage:
      'orca account push --to <ssh-host> [--agent claude|codex|all] [--wsl-distro <name>] [--claude-token-file <file>] [--dry-run] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'to', 'agent', 'wsl-distro', 'claude-token-file', 'dry-run'],
    notes: [
      'Codex: copies ~/.codex/auth.json to ~/.codex/auth.json on the host (existing file kept as auth.json.orca-bak).',
      'Claude: copies a live login (credentials file or macOS keychain) to ~/.claude/.credentials.json. If this machine has no live Claude login, run `claude setup-token` once, save the token, and pass --claude-token-file; it is stored at ~/.config/orca/claude-oauth-token and exported as CLAUDE_CODE_OAUTH_TOKEN from ~/.profile.',
      'Secrets travel over ssh stdin into 0600 files and are never printed. Use --wsl-distro when the ssh host is Windows and the worker runs in WSL.',
      'A copied login shares one refresh token between machines, so a refresh on one side can occasionally sign the other out; setup-token tokens do not have this problem.'
    ],
    examples: [
      'orca account push --to winlaptop --wsl-distro Ubuntu',
      'orca account push --to worker1 --agent codex --dry-run'
    ]
  },
  {
    path: ['account', 'select'],
    summary: 'Select an OpenCode or Devin profile for new agent launches',
    usage: 'orca account select --agent opencode|devin --account <id|system> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'agent', 'account']
  },
  {
    path: ['account', 'rm'],
    aliases: [['account', 'remove']],
    destructive: true,
    summary: 'Remove a managed OpenCode or Devin profile and its private data',
    usage: 'orca account rm --agent opencode|devin --account <id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'agent', 'account'],
    notes: [
      'Deletes credentials and conversation data in the managed profile. Stop its running agents first. System credentials are never removed.'
    ]
  }
]
