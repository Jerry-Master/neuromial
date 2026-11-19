import { useId } from 'react'

// SVG artwork for the burnt-paper design: filters, glyphs and the two layers (shadow + sheet) behind each answer.

// useId() returns characters that are awkward inside url(#...), so keep letters, digits, _ and -.
const safeId = (raw: string) => raw.replace(/[^\w-]/g, '')

// ---------- filters ----------
type Warp = { seed: number; freq: string; scale: number }

// Wobbly silhouette: noise-displaced copy of the shape.
function WarpNodes({ seed, freq, scale }: Warp) {
  return (
    <>
      <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves={4} seed={seed} result="w" />
      <feDisplacementMap in="SourceGraphic" in2="w" scale={scale} xChannelSelector="R" yChannelSelector="G" result="s" />
    </>
  )
}

type Region = { x: string; y: string; width: string; height: string }
const WIDE: Region = { x: '-4%', y: '-70%', width: '108%', height: '240%' }
const BUTTON: Region = { x: '-25%', y: '-80%', width: '150%', height: '260%' }

// Silhouette only, used for the offset shadow so it follows the same ragged outline as its sheet.
function Shadow({ id, region, ...warp }: Warp & { id: string; region: Region }) {
  return (
    <filter id={id} {...region}>
      <WarpNodes {...warp} />
    </filter>
  )
}

// Burnt paper: ragged edge, a charred rim, a wider scorched band that fades inward, and brown grain.
function Burn({ id, region, seed, freq, scale, blur = 4, brown = 0.85, char = 1 }: Warp & { id: string; region: Region; blur?: number; brown?: number; char?: number }) {
  return (
    <filter id={id} {...region}>
      <WarpNodes seed={seed} freq={freq} scale={scale} />
      <feTurbulence type="fractalNoise" baseFrequency="0.05 0.12" numOctaves={3} seed={seed + 7} result="n2" />
      <feMorphology in="s" operator="erode" radius={3} result="er1" />
      <feDisplacementMap in="er1" in2="n2" scale={9} xChannelSelector="R" yChannelSelector="G" result="d1" />
      <feGaussianBlur in="d1" stdDeviation={1.2} result="b1" />
      <feComposite in="s" in2="b1" operator="out" result="edge1" />
      <feMorphology in="s" operator="erode" radius={9} result="er2" />
      <feDisplacementMap in="er2" in2="n2" scale={16} xChannelSelector="G" yChannelSelector="B" result="d2" />
      <feGaussianBlur in="d2" stdDeviation={blur} result="b2" />
      <feComposite in="s" in2="b2" operator="out" result="edge2" />
      <feFlood floodColor="#8c5a2b" floodOpacity={brown} result="brown" />
      <feComposite in="brown" in2="edge2" operator="in" result="brownEdge" />
      <feFlood floodColor="#1f1109" floodOpacity={char} result="char" />
      <feComposite in="char" in2="edge1" operator="in" result="charEdge" />
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={seed + 10} result="g" />
      <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.35 0 0 0 0 0.25 0 0 0 0 0.12 1.3 0 0 0 -0.5" result="gc" />
      <feComposite in="gc" in2="s" operator="in" result="gm" />
      <feMerge>
        <feMergeNode in="s" />
        <feMergeNode in="brownEdge" />
        <feMergeNode in="charEdge" />
        <feMergeNode in="gm" />
      </feMerge>
    </filter>
  )
}

const ANSWERS: Warp[] = [
  { seed: 3, freq: '0.03 0.1', scale: 14 },
  { seed: 11, freq: '0.035 0.12', scale: 15 },
  { seed: 21, freq: '0.028 0.09', scale: 13 },
  { seed: 33, freq: '0.032 0.11', scale: 15 },
]
// Submit and Sign in/out are small, so their scorch is softer and the filter region is wider.
const BUTTON_WARP: Warp = { seed: 51, freq: '0.04 0.12', scale: 10 }

// Rendered once in the layout; every other component refers to these ids.
export function Filters() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        {ANSWERS.map((w, i) => (
          <g key={i}>
            <Burn id={`burn${i + 1}`} region={WIDE} {...w} />
            <Shadow id={`sh${i + 1}`} region={WIDE} {...w} />
          </g>
        ))}
        <Burn id="burn5" region={BUTTON} {...BUTTON_WARP} blur={7} brown={0.5} char={0.7} />
        <Shadow id="sh5" region={BUTTON} {...BUTTON_WARP} />
        {/* small rough edge for badges and the difficulty pill */}
        <filter id="roughS" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves={3} seed={5} result="w" />
          <feDisplacementMap in="SourceGraphic" in2="w" scale={3.5} xChannelSelector="R" yChannelSelector="G" result="s" />
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={15} result="g" />
          <feColorMatrix in="g" type="matrix" values="0 0 0 0 0.35 0 0 0 0 0.3 0 0 0 0 0.55 1.3 0 0 0 -0.5" result="gc" />
          <feComposite in="gc" in2="s" operator="in" result="gm" />
          <feMerge>
            <feMergeNode in="s" />
            <feMergeNode in="gm" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  )
}

// ---------- the two layers behind an answer / the submit button ----------
export function Shade({ filter }: { filter: string }) {
  return (
    <svg className="shade" aria-hidden="true">
      <rect className="shadow" x="7" y="7" width="100%" height="100%" filter={`url(#${filter})`} />
    </svg>
  )
}

export function Sheet({ filter }: { filter: string }) {
  return (
    <svg className="sheet" aria-hidden="true">
      <rect className="paper" x="1" y="1" width="100%" height="100%" filter={`url(#${filter})`} />
    </svg>
  )
}

// ---------- glyphs ----------
// Streak: an abstract flame. `hole` is the colour of whatever sits behind it, so the inner cut-out blends in.
export function Flame({ size = 18, hole = 'var(--bg)' }: { size?: number; hole?: string }) {
  const id = 'fl' + safeId(useId())
  return (
    <svg className="flame" viewBox="0 0 24 24" width={size} height={size} role="img" aria-label="Streak">
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" style={{ stopColor: 'var(--accent-2)' }} />
          <stop offset="1" style={{ stopColor: 'var(--accent)' }} />
        </linearGradient>
      </defs>
      <path d="M12 2c.2 5 6.2 7 6.2 13a6.2 6.2 0 0 1-12.4 0c0-3 1.8-4.6 3-6.2.5 1.7 1.4 2.5 2.6 2.5C10.8 9.2 10.8 5.6 12 2Z" fill={`url(#${id})`} />
      <path d="M12 21.6a3.1 3.1 0 0 1-3.1-3.1c0-2.1 3.1-3.6 3.1-6.1 0 2.5 3.1 4 3.1 6.1a3.1 3.1 0 0 1-3.1 3.1Z" style={{ fill: hole }} />
    </svg>
  )
}

const CROWNS = [
  { fill: '#e0a817', dark: '#a8740c', label: 'First place' },
  { fill: '#aab2c2', dark: '#6f7788', label: 'Second place' },
  { fill: '#c0713a', dark: '#7d4521', label: 'Third place' },
]

// Podium crowns replace the medal emoji: gold, silver, bronze.
export function Crown({ place }: { place: number }) {
  const c = CROWNS[place]
  return (
    <svg viewBox="0 0 24 24" width={22} height={22} role="img" aria-label={c.label} style={{ display: 'block' }}>
      <path d="M3 17 2 7l5.5 4.5L12 4l4.5 7.5L22 7l-1 10Z" fill={c.fill} />
      <rect x="3" y="19" width="18" height="2.4" rx=".4" fill={c.dark} />
      <circle cx="2" cy="7" r="1.6" fill={c.fill} />
      <circle cx="12" cy="4" r="1.6" fill={c.fill} />
      <circle cx="22" cy="7" r="1.6" fill={c.fill} />
      <path d="M7 17.2 6.2 12.6 9 14.8M17 17.2l.8-4.6L15 14.8" fill="none" stroke={c.dark} strokeWidth="1" strokeLinecap="round" strokeOpacity=".55" />
    </svg>
  )
}

// Sign out watches you leave (open eye); Sign in is the same eye, shut.
export function Eye({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 22 12" width={22} height={12} aria-hidden="true">
      {open ? (
        <>
          <path d="M1 6Q11-2 21 6Q11 14 1 6Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
          <ellipse cx="11" cy="6" rx="1.2" ry="4" fill="currentColor" />
        </>
      ) : (
        <path d="M1 4.5Q11 12 21 4.5M5 8.6 3.6 10.8M11 10.2V12M17 8.6l1.4 2.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      )}
    </svg>
  )
}

// Square-cornered brand mark for the front-page hero (the favicon itself keeps its rounded tile).
export function LogoMark({ size = 72 }: { size?: number }) {
  const raw = safeId(useId())
  const g = `lg${raw}`
  const h = `lh${raw}`
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7b6cf6" />
          <stop offset="1" stopColor="#d9468f" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" fill={`url(#${g})`} />
      <g id={h}>
        <path fill="#fff" d="M30.5 13.5C26 11.8 20.6 12.9 18.6 17C14 17.6 11.4 21.9 12.6 26C9.6 28.6 9.4 33.6 12.4 36.2C11 40.8 14 45.4 18.6 45.6C19.8 49.8 24.6 52.2 28.6 50.4C29.4 50.9 30 51 30.5 50.8Z" />
        <path fill="none" stroke="#8a4fd8" strokeWidth="2.6" strokeLinecap="round" d="M24 18.5c3 1.6 3.6 4.6 1.4 7.2M16.8 27.6c3.6-1.2 7.2.4 8.4 3.8M15.8 37.4c3.2.4 5.4 2.6 5.6 5.8M24.6 46c.4-2.8 2.6-4.4 5.4-4.2" />
      </g>
      <use href={`#${h}`} transform="matrix(-1 0 0 1 64 0)" />
    </svg>
  )
}
