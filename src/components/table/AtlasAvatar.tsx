/**
 * Atlas's face: a calm geometric mask that breathes, blinks now and then and
 * glances while it thinks. A ring around it sweeps for the thinking time.
 */
export function AtlasAvatar({ thinking }: { thinking: boolean }) {
  return (
    <span
      className={`avatar avatar-atlas atlas-face ${thinking ? 'is-thinking' : ''}`}
      aria-hidden
    >
      <svg viewBox="0 0 36 36" className="atlas-svg">
        <defs>
          <linearGradient id="atlas-skin" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#5b80a1" />
            <stop offset="1" stopColor="#2b4560" />
          </linearGradient>
        </defs>
        <rect width="36" height="36" rx="10" fill="url(#atlas-skin)" />
        <path
          d="M6 9 Q18 2 30 9"
          fill="none"
          stroke="rgb(255 255 255 / 0.18)"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <g className="atlas-eyes">
          <rect x="9" y="14" width="6" height="6.5" rx="3" fill="#e8f0f8" />
          <rect x="21" y="14" width="6" height="6.5" rx="3" fill="#e8f0f8" />
        </g>
        <path
          d="M14 26 Q18 28.4 22 26"
          fill="none"
          stroke="#e8f0f8"
          strokeOpacity="0.75"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
      {thinking && (
        <svg viewBox="0 0 44 44" className="think-ring">
          <rect x="2" y="2" width="40" height="40" rx="13" pathLength="100" />
        </svg>
      )}
    </span>
  )
}
