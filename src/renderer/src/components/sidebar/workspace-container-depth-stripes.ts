// Each nesting level gets its own hue for a thin left-edge stripe (from the git-graph lane
// palette, distinct in light and dark themes) so agents in one group read as a group at a glance.
const DEPTH_STRIPES = [
  'border-l-git-graph-lane-4/70',
  'border-l-git-graph-lane-5/70',
  'border-l-git-graph-lane-1/70',
  'border-l-git-graph-lane-2/70',
  'border-l-git-graph-lane-3/70'
] as const

const SELECTED_DEPTH_STRIPES = [
  'border-l-git-graph-lane-4 border-l-[6px] pl-[9px]',
  'border-l-git-graph-lane-5 border-l-[6px] pl-[9px]',
  'border-l-git-graph-lane-1 border-l-[6px] pl-[9px]',
  'border-l-git-graph-lane-2 border-l-[6px] pl-[9px]',
  'border-l-git-graph-lane-3 border-l-[6px] pl-[9px]'
] as const

// Why: the selected card's tint and ring wash out a 70% stripe, so selection draws it solid and
// wider to keep the nesting hue readable.
export function depthStripeClass(depth: number, selected = false): string {
  const stripes = selected ? SELECTED_DEPTH_STRIPES : DEPTH_STRIPES
  return stripes[depth % stripes.length]
}
