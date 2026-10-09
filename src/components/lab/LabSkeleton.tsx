/** Placeholder with the lab's shape while its code loads. */
export function LabSkeleton() {
  return (
    <div
      className="lab lab-skeleton"
      role="status"
      aria-label="Loading the lab"
    >
      <span className="skeleton skeleton-title" />
      <span className="skeleton skeleton-meter" />
      <span className="skeleton skeleton-row" />
      <span className="skeleton skeleton-row" />
      <span className="skeleton skeleton-row" />
    </div>
  )
}
