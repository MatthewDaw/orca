import { describe, expect, it, vi } from 'vitest'
import {
  SPAWN_HELPER_STALL_NOTICE,
  watchMacosSpawnHelperStall
} from './macos-spawn-helper-stall-watchdog'

function run(state: { output?: boolean; dead?: boolean; command: string }) {
  const notify = vi.fn()
  const onStalled = vi.fn()
  let fire: () => void = () => {}
  watchMacosSpawnHelperStall({
    pid: 1,
    hasOutput: () => state.output ?? false,
    isDead: () => state.dead ?? false,
    notify,
    onStalled,
    setTimer: (cb) => {
      fire = cb
      return {}
    },
    readCommand: async () => state.command
  })
  return {
    notify,
    onStalled,
    fire: async () => (fire(), await Promise.resolve(), await Promise.resolve())
  }
}

describe('watchMacosSpawnHelperStall', () => {
  it('tells the user when the helper never got past launch', async () => {
    const t = run({ command: '/x/spawn-helper /cwd /usr/bin/login -flpq' })
    await t.fire()
    expect(t.onStalled).toHaveBeenCalledOnce()
    expect(t.notify).toHaveBeenCalledWith(SPAWN_HELPER_STALL_NOTICE)
  })

  it('stays quiet once the shell took over the process', async () => {
    const t = run({ command: '/usr/bin/login -flpq matt' })
    await t.fire()
    expect(t.notify).not.toHaveBeenCalled()
  })

  it('stays quiet when the terminal already produced output', async () => {
    const t = run({ output: true, command: '/x/spawn-helper' })
    await t.fire()
    expect(t.notify).not.toHaveBeenCalled()
  })
})
