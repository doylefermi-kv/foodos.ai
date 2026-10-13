import type { ReactNode } from 'react'

/**
 * Marks a claim the company cannot yet stand behind. The Product Designer's
 * rule: everything unverifiable is visibly chipped on the page, and the whole
 * lot comes off by deleting this component's usages once real content exists.
 *
 * `proposal` is the green variant — a stance we are proposing rather than a
 * number we are missing.
 */
export function Ph({
  children,
  proposal = false,
}: {
  children: ReactNode
  proposal?: boolean
}) {
  return (
    <span className={proposal ? 'ph ph--proposal' : 'ph'}>{children}</span>
  )
}
