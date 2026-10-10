import type { ReactNode } from 'react'

/** A titled panel of an info page; its heading names the region. */
export function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: ReactNode
}) {
  return (
    <section className="panel info-section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {children}
    </section>
  )
}
