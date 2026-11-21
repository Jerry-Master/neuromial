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

// Brand mark: brain from above, cortex outline in the accent gradient.
// Left hemisphere holds text-like waves (language), right hemisphere circuit traces.
export function LogoMark({ size = 72 }: { size?: number }) {
  const g = `lg${safeId(useId())}`
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'block', flex: 'none' }}>
      <defs>
        <linearGradient id={g} gradientUnits="userSpaceOnUse" x1="10" y1="10" x2="56" y2="56">
          <stop offset="0" style={{ stopColor: 'var(--accent)' }} />
          <stop offset="1" style={{ stopColor: 'var(--accent-2)' }} />
        </linearGradient>
      </defs>
      <g stroke={`url(#${g})`}>
        <path d="M31.4 4.9A5.7 5.7 0 0 0 22.0 5.5A4.9 4.9 0 0 0 16.0 11.0A5.0 5.0 0 0 0 11.2 17.8A4.2 4.2 0 0 0 9.7 24.6A5.0 5.0 0 0 0 5.8 32.0A4.5 4.5 0 0 0 4.5 39.4A4.6 4.6 0 0 0 7.6 46.3A5.9 5.9 0 0 0 14.8 53.0A5.2 5.2 0 0 0 21.8 58.0A5.7 5.7 0 0 0 31.1 60.0L31.1 60.0L30.8 59.1L30.5 58.1L30.1 57.1L29.7 56.0L29.4 55.0L29.1 53.9L28.9 52.8L28.8 51.7L28.7 50.5L28.7 49.4L28.9 48.3L29.0 47.1L29.3 46.1L29.6 45.0L30.0 43.9L30.4 42.9L30.8 41.9L31.2 40.9L31.5 39.9L31.9 38.9L32.3 37.9L32.6 37.0L32.9 36.0L33.2 35.1L33.4 34.2L33.4 33.4L33.4 32.7L33.3 31.9L33.0 31.1L32.6 30.3L32.1 29.4L31.5 28.4L30.8 27.4L30.2 26.3L29.7 25.2L29.3 24.0L29.0 22.8L28.9 21.5L28.9 20.4L29.1 19.2L29.3 18.1L29.6 17.0L30.0 16.0L30.3 14.9L30.7 13.9L31.0 13.0L31.3 12.0L31.6 11.1L31.7 10.2L31.9 9.3L31.9 8.5L31.9 7.6L31.8 6.7L31.6 5.9Z"/>
        <path d="M12.0 22q2.42 -1.3 4.83 0t4.83 0t4.83 0"/>
        <path d="M8.5 30.5q2.38 -1.3 4.75 0t4.75 0t4.75 0t4.75 0"/>
        <path d="M8.5 39q2.25 -1.3 4.50 0t4.50 0t4.50 0t4.50 0"/>
        <path d="M11.5 47.5q2.50 -1.3 5.00 0t5.00 0"/>
        <g transform="translate(0.7 -0.7) rotate(2 46 32)">
        <path d="M34.4 59.0A4.8 4.8 0 0 0 42.3 58.0A5.5 5.5 0 0 0 49.1 51.5A6.1 6.1 0 0 0 57.7 46.3A4.6 4.6 0 0 0 58.6 38.6A4.3 4.3 0 0 0 59.3 31.5A5.0 5.0 0 0 0 53.9 25.1A4.1 4.1 0 0 0 53.9 18.3A5.1 5.1 0 0 0 47.8 12.5A5.4 5.4 0 0 0 42.6 5.0A4.7 4.7 0 0 0 34.7 4.1L34.7 4.1L35.0 5.1L35.2 6.3L35.3 7.4L35.3 8.5L35.2 9.7L35.1 10.8L34.9 11.9L34.6 13.0L34.3 14.0L33.9 15.1L33.5 16.1L33.2 17.0L32.9 18.0L32.6 18.9L32.4 19.8L32.3 20.6L32.3 21.5L32.4 22.2L32.6 23.0L32.8 23.8L33.2 24.7L33.8 25.6L34.4 26.6L35.0 27.6L35.6 28.7L36.2 29.9L36.6 31.1L36.8 32.3L36.8 33.6L36.7 34.8L36.5 35.9L36.2 37.0L35.8 38.0L35.5 39.1L35.1 40.1L34.7 41.1L34.3 42.1L33.9 43.1L33.6 44.1L33.2 45.1L32.9 46.0L32.6 46.9L32.4 47.9L32.2 48.7L32.1 49.6L32.1 50.5L32.1 51.3L32.3 52.2L32.4 53.1L32.7 54.0L33.0 55.0L33.3 55.9L33.7 56.9L34.0 57.9Z"/>
        <circle cx="47" cy="22" r="2.2"/>
        <path d="M44.8 22H40.5V29"/>
        <circle cx="42" cy="42" r="2.2"/>
        <path d="M44.2 42H48.5V35"/>
        </g>
      </g>
    </svg>
  )
}
