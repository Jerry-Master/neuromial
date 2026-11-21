import { useCallback, useEffect, useState } from 'react'
import { HashRouter, Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  api, clearHistory, getToken, handleCallback, login, loadHistory, logout,
  saveResult, todayRequest, type Question, type Result,
} from './lib'
import { Crown, Eye, Filters, Flame, LogoMark, Sheet, Shade } from './art'

function useLoggedIn() {
  const [state, setState] = useState<boolean | null>(null)
  useEffect(() => {
    getToken().then((t) => setState(!!t))
  }, [])
  return state
}

function Logo() {
  return <LogoMark size={30} />
}

// One button, two states: signed out shows "Sign in" (closed eye), signed in shows "Sign out" (open eye).
function AuthButton({ loggedIn }: { loggedIn: boolean | null }) {
  if (loggedIn === null) return null
  return (
    <button className="grim" onClick={() => (loggedIn ? logout() : login())}>
      <svg className="bg" aria-hidden="true">
        <rect className="shape" x="1" y="1" width="100%" height="100%" filter="url(#burn5)" />
      </svg>
      <Eye open={loggedIn} />
      <span>{loggedIn ? 'Sign out' : 'Sign in'}</span>
    </button>
  )
}

function Layout({ children }: { children: React.ReactNode }) {
  const loggedIn = useLoggedIn()
  const home = useLocation().pathname === '/'
  return (
    <div className="app">
      <Filters />
      {home ? (
        // the brand lives in the hero on the front page, so the bar is just the links, centred
        <header className="home">
          <nav>
            <NavLink to="/leaderboard">Leaderboard</NavLink>
            {loggedIn && <NavLink to="/me">Profile</NavLink>}
            <AuthButton loggedIn={loggedIn} />
          </nav>
        </header>
      ) : (
        <header>
          <div className="bar">
            <Link to="/" className="brand"><Logo /> neuromial</Link>
            <nav>
              <NavLink to="/leaderboard">Leaderboard</NavLink>
              {loggedIn && <NavLink to="/me">Profile</NavLink>}
              <AuthButton loggedIn={loggedIn} />
            </nav>
          </div>
        </header>
      )}
      <main>{children}</main>
    </div>
  )
}

function UsernameForm({ current, onSaved }: { current?: string; onSaved: (name: string) => void }) {
  const [name, setName] = useState(current ?? '')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    const { status, data } = await api<any>('/me/username', { method: 'PUT', body: JSON.stringify({ username: name.trim() }) }, true)
    setBusy(false)
    if (status === 200) onSaved(data.username)
    else setMsg(data.error ?? 'Could not save the username.')
  }
  return (
    <form onSubmit={save} className="username">
      <label htmlFor="uname" className="label">Username</label>
      <div className="row">
        <input id="uname" value={name} onChange={(e) => setName(e.target.value)} placeholder="username" maxLength={20} minLength={3} required autoFocus={!current} />
        <button className="primary" disabled={busy || name.trim() === current}>{current ? 'Change' : 'Save'}</button>
      </div>
      {msg && <p className="err" role="alert">{msg}</p>}
      <p className="hint">3-20 letters, numbers or underscores. Shown on the leaderboard. Must be unique.</p>
    </form>
  )
}

function shareText(day: string, r: Result, streak?: number) {
  const squares = ['⬜', '⬜', '⬜', '⬜']
  squares[r.correctIndex] = '🟩'
  if (!r.correct) squares[r.choice] = '🟥'
  return `neuromial ${day}\n${squares.join('')}${streak ? ` 🔥${streak}` : ''}\n${location.origin}${import.meta.env.BASE_URL}`
}

function ReportForm({ questionId }: { questionId: string }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle')
  if (state === 'sent') return <p className="hint">Thanks, we will check this question.</p>
  if (!open) return <button className="link" onClick={() => setOpen(true)}>Report a problem with this question</button>
  async function send(e: React.FormEvent) {
    e.preventDefault()
    setState('busy')
    const { status } = await api('/report', { method: 'POST', body: JSON.stringify({ questionId, note }) }, true)
    setState(status === 200 ? 'sent' : 'error')
  }
  return (
    <form className="report" onSubmit={send}>
      <label htmlFor="note" className="label">What is wrong?</label>
      <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} required autoFocus
        placeholder="e.g. option B is also correct because…" />
      <div className="row">
        <button className="primary small" disabled={state === 'busy' || !note.trim()}>Send</button>
        <button type="button" className="ghost small" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {state === 'error' && <p className="err">Could not send. Try again.</p>}
    </form>
  )
}

function Today() {
  const loggedIn = useLoggedIn()
  const [day, setDay] = useState('')
  const [q, setQ] = useState<Question | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  // Answering is two steps: pick an option (selected), then press Submit (submitting -> result).
  const [selected, setSelected] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [me, setMe] = useState<any>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (loggedIn) api('/me', {}, true).then((r) => setMe(r.data))
    if (loggedIn === false) clearHistory() // anonymous play is never remembered
  }, [loggedIn])

  // signed-in users get one scored attempt per day, so restore today's saved result
  useEffect(() => {
    if (loggedIn && day) {
      const saved = loadHistory()[day] ?? null
      setResult(saved)
      if (saved) setSelected(saved.choice)
    }
  }, [loggedIn, day])

  useEffect(() => {
    todayRequest
      .then((r) => {
        if (!r.data.question) throw new Error('no question')
        setDay(r.data.day)
        setQ(r.data.question)
      })
      .catch(() => setError('Could not load today’s question.'))
  }, [])

  // choosing only highlights the option; nothing is sent until Submit
  const select = useCallback((choice: number) => {
    if (result || submitting) return
    setSelected(choice)
    setError('')
  }, [result, submitting])

  const submit = useCallback(async () => {
    if (!q || selected === null || result || submitting) return
    const choice = selected
    setSubmitting(true)
    setError('')
    const scored = !!(await getToken())
    const { status, data } = await api<any>(
      scored ? '/answer/scored' : '/answer',
      { method: 'POST', body: JSON.stringify({ questionId: q.id, choice }) },
      scored,
    ).catch(() => ({ status: 0, data: {} as any }))
    setSubmitting(false)
    if (status === 200) {
      const r: Result = { ...data, choice }
      if (r.saved) {
        saveResult(day, r)
        setMe((m: any) => (m ? { ...m, streak: r.streak ?? m.streak } : m))
      }
      setResult(r)
    } else if (status === 403) {
      setError('Choose a username first.')
      setMe((m: any) => (m ? { ...m, username: null } : m))
    } else if (status === 409 && data.previous) {
      setError('You already answered today on this account.')
    } else {
      setError('Something went wrong. Try again.')
    }
  }, [q, selected, result, submitting, day])

  // keyboard: A-D or 1-4 picks an option, Enter submits
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement
      if (e.metaKey || e.ctrlKey || e.altKey || t.closest('input, textarea')) return
      if (e.key === 'Enter') {
        if (!t.closest('button, a')) submit() // on a focused button, Enter already clicks it
        return
      }
      const i = 'abcd'.indexOf(e.key.toLowerCase()) >= 0 ? 'abcd'.indexOf(e.key.toLowerCase()) : '1234'.indexOf(e.key)
      if (i >= 0) select(i)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [select, submit])

  async function share() {
    if (!result) return
    const text = shareText(day, result, me?.streak)
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ text })
      else {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      /* dismissed */
    }
  }

  if (!q) return error ? <p className="err">{error}</p> : <div className="card skeleton" aria-busy="true" />
  if (loggedIn && me && !me.username) {
    return (
      <section className="card">
        <h1>Pick a username</h1>
        <p>This is the name shown on the leaderboard.</p>
        <UsernameForm onSaved={(u) => setMe({ ...me, username: u })} />
      </section>
    )
  }
  const pretty = day ? new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }) : ''
  const locked = !!result || submitting
  // Submit has three looks: not ready (nothing picked), busy, and submitted
  const submitState = result ? 'done' : submitting ? 'busy' : selected === null ? 'off' : 'ready'
  const submitLabel = result ? 'Submitted' : submitting ? 'Submitting…' : 'Submit'
  return (
    <>
      <div className="hero">
        <LogoMark size={84} />
        <h1 className="wordmark">neuromial</h1>
        <p className="tagline">We publish one neuroanatomy question every day.</p>
      </div>
      <div className="kicker">
        <span>{pretty}</span>
        {q.difficulty && (
          <span className={`pill ${q.difficulty}`}>
            <svg aria-hidden="true"><rect x="1" y="1" width="100%" height="100%" filter="url(#roughS)" /></svg>
            <span>{q.difficulty}</span>
          </span>
        )}
        {loggedIn && me && <span className="streak" title="Streak"><Flame size={18} /> {me.streak}</span>}
      </div>
      <section className="question">
        <p className="eyebrow">Question of the day</p>
        <h2 className="prompt">{q.prompt}</h2>
        <ul className="options">
          {q.options.map((o, i) => {
            let cls = ''
            if (result) cls = i === result.correctIndex ? 'right' : i === result.choice ? 'wrong' : 'dim'
            else if (selected === i) cls = 'sel'
            const n = (i % 4) + 1
            return (
              <li key={i} className={`opt ${cls} ${locked ? 'locked' : ''}`} style={{ transform: `rotate(${ROTATE[i % 4]}deg)` }}>
                <Shade filter={`sh${n}`} />
                <div className="face">
                  <Sheet filter={`burn${n}`} />
                  <button disabled={locked} onClick={() => select(i)} aria-pressed={selected === i}>
                    <span className="key">
                      <svg aria-hidden="true"><rect x="1" y="1" width="28" height="28" filter="url(#roughS)" /></svg>
                      <span>{'ABCD'[i]}</span>
                    </span>
                    <span>{o}</span>
                    {result && i === result.correctIndex && <span className="mark" aria-label="correct">✓</span>}
                    {result && !result.correct && i === result.choice && <span className="mark" aria-label="your answer">✗</span>}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
        <div className="submit-row">
          <div className={`opt cta ${submitState}`} style={{ transform: 'rotate(-0.3deg)' }}>
            <Shade filter="sh5" />
            <div className="face">
              <Sheet filter="burn5" />
              <button type="button" disabled={submitState !== 'ready'} onClick={submit} aria-live="polite">{submitLabel}</button>
            </div>
          </div>
        </div>
        {!result && <p className="hint center">Choose with A–D or tap, then press Enter or Submit.</p>}
        {error && <p className="err" role="alert">{error}</p>}
      </section>
      {result && (
        <section className={`card explain ${result.correct ? 'ok' : 'bad'}`} aria-live="polite">
          <div className="verdict">
            <h2>{result.correct ? 'Correct!' : 'Not quite.'}</h2>
            {result.saved && result.points > 0 && <span className="burst">+{result.points}</span>}
          </div>
          <p>{result.explanation}</p>
          <div className="row">
            <button className="primary" onClick={share}>{copied ? 'Copied!' : 'Share result'}</button>
            {!result.saved && <button className="ghost" onClick={() => { setResult(null); setSelected(null) }}>Try again</button>}
          </div>
          {loggedIn === false && (
            <p className="nudge">
              Playing anonymously. <button className="link" onClick={() => login()}>Sign in</button> to earn points, keep a streak and join the leaderboard.
            </p>
          )}
          {result.saved && <p className="hint">Come back tomorrow (00:00 UTC) for a new question.</p>}
          <ReportForm questionId={q.id} />
        </section>
      )}
    </>
  )
}

// each answer sits a hair off-level, like pieces cut by hand
const ROTATE = [-0.35, 0.3, -0.2, 0.4]

type Row = { name: string; total: number; streak: number }

// Used by both tabs (all time and this week): same rows, same bands.
function Leaderboard() {
  const [period, setPeriod] = useState<'all' | 'week'>('all')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [mine, setMine] = useState<string | null>(null)
  useEffect(() => {
    getToken().then((t) => {
      if (t) api<any>('/me', {}, true).then((r) => setMine(r.data.username ?? null))
    })
  }, [])
  useEffect(() => {
    api<{ top: Row[] }>(`/leaderboard${period === 'week' ? '?period=week' : ''}`).then((r) => setRows(r.data.top ?? []))
  }, [period])
  return (
    <>
      <h1 className="page">Leaderboard</h1>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={period === 'all'} onClick={() => { if (period !== 'all') { setRows(null); setPeriod('all') } }}>All time</button>
        <button role="tab" aria-selected={period === 'week'} onClick={() => { if (period !== 'week') { setRows(null); setPeriod('week') } }}>This week</button>
      </div>
      {!rows ? <div className="card skeleton" aria-busy="true" /> : rows.length === 0 ? (
        <p className="card">No scores yet. Be the first.</p>
      ) : (
        <ol className="bands board">
          {rows.map((r, i) => (
            <li key={r.name} className={r.name === mine ? 'me' : ''}>
              <span className="rank">{i < 3 ? <Crown place={i} /> : i + 1}</span>
              <span className="name">{r.name}{r.name === mine && <em> (you)</em>}</span>
              <span className="score">{r.total} <small>pts</small></span>
              <span className="streakcell">{r.streak > 0 && <><Flame size={16} hole="var(--band)" />{r.streak}</>}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  )
}

function EmailToggle({ me, onChange }: { me: any; onChange: (v: boolean) => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  if (!me.emailAvailable) return null
  async function toggle() {
    setBusy(true)
    setMsg('')
    const next = !me.emailOptIn
    const { status, data } = await api<any>('/me/email', { method: 'PUT', body: JSON.stringify({ optIn: next }) }, true)
    setBusy(false)
    if (status === 200) onChange(next)
    else setMsg(data.error ?? 'Could not save.')
  }
  return (
    <div className="setting">
      <div>
        <p className="label">Daily email</p>
        <p className="hint">A short reminder at 07:00 UTC if you have not answered yet.</p>
      </div>
      <button role="switch" aria-checked={!!me.emailOptIn} className="switch" disabled={busy} onClick={toggle}>
        <span />
      </button>
      {msg && <p className="err">{msg}</p>}
    </div>
  )
}

function Profile() {
  const [me, setMe] = useState<any>(null)
  const nav = useNavigate()
  useEffect(() => {
    getToken().then((t) => {
      if (!t) return nav('/')
      api('/me', {}, true).then((r) => setMe(r.data))
    })
  }, [nav])
  if (!me) return <div className="card skeleton" aria-busy="true" />
  const pct = me.answered ? Math.round((100 * me.correctCount) / me.answered) : 0
  return (
    <>
      <h1 className="page">{me.username ?? 'Your stats'}</h1>
      <div className="stats">
        <div className="stat"><b>{me.total}</b><span>points</span></div>
        <div className="stat"><b><Flame size={22} hole="var(--band-b)" /> {me.streak}</b><span>streak</span></div>
        <div className="stat"><b>{pct}%</b><span>{me.correctCount}/{me.answered} correct</span></div>
      </div>
      <section className="plain">
        <UsernameForm current={me.username ?? undefined} onSaved={(u) => setMe({ ...me, username: u })} />
        <EmailToggle me={me} onChange={(v) => setMe({ ...me, emailOptIn: v })} />
      </section>
      {me.history.length > 0 && (
        <>
          <h2 className="section">History</h2>
          <ul className="bands history">
            {me.history.map((h: any) => (
              <li key={h.day}>
                <span>{h.day}</span>
                <span className={h.correct ? 'okc' : 'badc'}>{h.correct ? '✓ correct' : '✗ wrong'}</span>
                <span className="score">{h.points} <small>pts</small></span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

// Cognito redirects to <site>/?code=... (or ?error=...); finish sign-in before the router renders.
function useOAuthReturn() {
  const params = new URLSearchParams(location.search)
  const code = params.get('code')
  const err = params.get('error_description') ?? ''
  const [done, setDone] = useState(!code && !err)
  useEffect(() => {
    if (err) {
      // first social sign-in that was just linked to an existing account: Cognito asks for one retry
      if (/already found an entry/i.test(err) && !sessionStorage.getItem('neuromial:retried')) {
        sessionStorage.setItem('neuromial:retried', '1')
        login(sessionStorage.getItem('neuromial:provider') || undefined)
        return
      }
      sessionStorage.removeItem('neuromial:retried')
      history.replaceState(null, '', import.meta.env.BASE_URL)
      setDone(true)
      return
    }
    if (!code) return
    sessionStorage.removeItem('neuromial:retried')
    handleCallback(code)
      .catch(() => undefined)
      .finally(() => {
        history.replaceState(null, '', import.meta.env.BASE_URL)
        setDone(true)
      })
  }, [code, err])
  return done
}

export default function App() {
  if (!useOAuthReturn()) return <p className="center pad">Signing you in…</p>
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/me" element={<Profile />} />
        </Routes>
      </Layout>
    </HashRouter>
  )
}
