import type { PtyIncarnationId } from './pty-incarnation'
import type { RuntimeMobileSessionTabsResult } from './runtime-session-contracts'
import type { TabGroupLayoutNode } from './tab-types'
import type { TerminalPaneLayoutNode } from './terminal-tab-types'

export type RuntimeTerminalOrphanAdoptionClaim = {
  terminal: string
  ptyId: string
  incarnationId: PtyIncarnationId
  tabId: string
  leafId: string
}

export type RuntimeTerminalOrphanTopologyTab = {
  tabId: string
  root: TerminalPaneLayoutNode
  activeLeafId: string
  expandedLeafId: string | null
}

export type RuntimeTerminalOrphanTopologyGroup = {
  id: string
  activeTabId: string
  tabOrder: string[]
  recentTabIds?: string[]
}

export type RuntimeTerminalOrphanTopology = {
  tabs: RuntimeTerminalOrphanTopologyTab[]
  groups: RuntimeTerminalOrphanTopologyGroup[]
  groupLayout?: TabGroupLayoutNode
}

export type RuntimeTerminalOrphanAdoptionRequest = {
  worktree: string
  expectedTopologyRevision: number
  claims: RuntimeTerminalOrphanAdoptionClaim[]
  activeTabId?: string
  activeGroupId?: string
  topology?: RuntimeTerminalOrphanTopology
}

export type RuntimeTerminalOrphanAdoptionResult = {
  adopted: boolean
  topologyRevision: number
  snapshot: RuntimeMobileSessionTabsResult
}
