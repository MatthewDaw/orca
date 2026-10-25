// Each nesting level gets its own hue for a thin left-edge stripe (from the git-graph lane
// palette, distinct in light and dark themes) so agents in one group read as a group at a glance.
const DEPTH_STRIPES = [
  'border-l-git-graph-lane-4/70',
  'border-l-git-graph-lane-5/70',
  'border-l-git-graph-lane-1/70',
  'border-l-git-graph-lane-2/70',
  'border-l-git-graph-lane-3/70'
] as const

export function depthStripeClass(depth: number): string {
  return DEPTH_STRIPES[depth % DEPTH_STRIPES.length]
}
