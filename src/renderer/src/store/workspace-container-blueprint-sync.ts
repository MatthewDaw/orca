import {
  blueprintToContainers,
  buildContainerBlueprint,
  serializeContainerBlueprint
} from '../../../shared/workspace-container-blueprint'
import { resolveWorktreeIdForRef, worktreeRefFor } from './workspace-container-worktree-refs'
import { useAppStore } from '.'

const SYNC_DEBOUNCE_MS = 300

// Imports a project's blueprint the first time the project is seen with no local containers, then mirrors
// every later change back into the project file. Waits for the catalog so an empty list never overwrites it.
export function installWorkspaceContainerBlueprintSync(): () => void {
  const initializedRepoIds = new Set<string>()
  const lastWritten = new Map<string, string>()
  let running: Promise<void> = Promise.resolve()
  let timer: ReturnType<typeof setTimeout> | null = null

  const syncOnce = async (): Promise<void> => {
    const api = window.api?.workspaceContainers
    const state = useAppStore.getState()
    if (!api || !state.workspaceContainersLoaded) {
      return
    }
    for (const repo of state.repos) {
      const worktrees = state.worktreesByRepo[repo.id]
      if (repo.connectionId || !worktrees?.some((w) => w.isMainWorktree)) {
        continue
      }
      const prefix = `${repo.id}::`
      const ownContainers = () =>
        useAppStore.getState().workspaceContainers.filter((c) => c.worktreeId.startsWith(prefix))

      if (!initializedRepoIds.has(repo.id)) {
        initializedRepoIds.add(repo.id)
        if (ownContainers().length === 0) {
          const blueprint = await api.readBlueprint(repo.path)
          const incoming = blueprint
            ? blueprintToContainers(
                blueprint,
                (ref) => resolveWorktreeIdForRef(worktrees, ref),
                Date.now()
              )
            : []
          if (incoming.length > 0) {
            await api.importContainers(incoming)
          }
        }
      }

      const blueprint = buildContainerBlueprint(ownContainers(), (id) =>
        worktreeRefFor(worktrees, id)
      )
      const text = serializeContainerBlueprint(blueprint)
      if (lastWritten.get(repo.id) !== text) {
        lastWritten.set(repo.id, text)
        await api.writeBlueprint(repo.path, blueprint)
      }
    }
  }

  const schedule = (): void => {
    if (timer) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      running = running.then(syncOnce).catch(() => undefined)
    }, SYNC_DEBOUNCE_MS)
  }

  let previous = useAppStore.getState()
  schedule()
  const unsubscribe = useAppStore.subscribe((state) => {
    if (
      state.repos !== previous.repos ||
      state.worktreesByRepo !== previous.worktreesByRepo ||
      state.workspaceContainers !== previous.workspaceContainers ||
      state.workspaceContainersLoaded !== previous.workspaceContainersLoaded
    ) {
      schedule()
    }
    previous = state
  })
  return () => {
    unsubscribe()
    if (timer) {
      clearTimeout(timer)
    }
  }
}
