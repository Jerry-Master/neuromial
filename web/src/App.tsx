import { useCallback, useEffect, useState } from 'react'
import { HashRouter, Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import {
  api, clearHistory, getToken, handleCallback, login, loadHistory, logout,
  saveResult, todayRequest, type Question, type Result,
} from './lib'

function useLoggedIn() {
  const [state, setState] = useState<boolean | null>(null)
  useEffect(() => {
    getToken().then((t) => setState(!!t))
  }, [])
  return state
}

function Logo() {
  return <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={28} height={28} />
}

function Layout({ children }: { children: React.ReactNode }) {
  const loggedIn = useLoggedIn()
  return (
    <div className="app">
      <header>
        <div className="bar">
          <Link to="/" className="brand"><Logo /> neuromial</Link>
          <nav>
            <NavLink to="/leaderboard">Leaderboard</NavLink>
            {loggedIn === false && <button className="primary small" onClick={() => login()}>Sign in</button>}
            {loggedIn && <><NavLink to="/me">Profile</NavLink><button className="ghost small" onClick={logout}>Sign out</button></>}
          </nav>
        </div>
      </header>
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
  const [pending, setPending] = useState<number | null>(null)
  const [me, setMe] = useState<any>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (loggedIn) api('/me', {}, true).then((r) => setMe(r.data))
    if (loggedIn === false) clearHistory() // anonymous play is never remembered
  }, [loggedIn])

  // signed-in users get one scored attempt per day, so restore today's saved result
  useEffect(() => {
    if (loggedIn && day) setResult(loadHistory()[day] ?? null)
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

  const choose = useCallback(async (choice: number) => {
    if (!q || result || pending !== null) return
    setPending(choice) // highlight at once, reveal when the server answers
    setError('')
    const scored = !!(await getToken())
    const { status, data } = await api<any>(
      scored ? '/answer/scored' : '/answer',
      { method: 'POST', body: JSON.stringify({ questionId: q.id, choice }) },
      scored,
    ).catch(() => ({ status: 0, data: {} as any }))
    setPending(null)
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
  }, [q, result, pending, day])

  // keyboard: A-D or 1-4 picks an option
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement).closest('input, textarea')) return
      const i = 'abcd'.indexOf(e.key.toLowerCase()) >= 0 ? 'abcd'.indexOf(e.key.toLowerCase()) : '1234'.indexOf(e.key)
      if (i >= 0) choose(i)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [choose])

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
  const pretty = day ? new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }) : ''
  return (
    <>
      <div className="kicker">
        <span>{pretty}</span>
        {q.difficulty && <span className={`pill ${q.difficulty}`}>{q.difficulty}</span>}
        {loggedIn && me && <span className="streak" title="Streak">🔥 {me.streak}</span>}
      </div>
      <section className="card question">
        <p className="eyebrow">Question of the day</p>
        <h1>{q.prompt}</h1>
        <ul className="options">
          {q.options.map((o, i) => {
            let cls = ''
            if (result) cls = i === result.correctIndex ? 'right' : i === result.choice ? 'wrong' : 'dim'
            else if (pending === i) cls = 'picked'
            return (
              <li key={i}>
                <button className={cls} disabled={!!result || pending !== null} onClick={() => choose(i)}
                  aria-pressed={pending === i || result?.choice === i}>
                  <span className="key">{'ABCD'[i]}</span>
                  <span>{o}</span>
                  {result && i === result.correctIndex && <span className="mark" aria-label="correct">✓</span>}
                  {result && !result.correct && i === result.choice && <span className="mark" aria-label="your answer">✗</span>}
                </button>
              </li>
            )
          })}
        </ul>
        {!result && <p className="hint center">Press A–D or tap an option.</p>}
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
            {!result.saved && <button className="ghost" onClick={() => setResult(null)}>Try again</button>}
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

type Row = { name: string; total: number; streak: number }

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
        <ol className="card board">
          {rows.map((r, i) => (
            <li key={r.name} className={r.name === mine ? 'me' : ''}>
              <span className={`rank r${i + 1}`}>{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
              <span className="name">{r.name}{r.name === mine && <em> (you)</em>}</span>
              <span className="score">{r.total} <small>pts</small></span>
              <span className="flame">{r.streak > 0 ? `🔥${r.streak}` : ''}</span>
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
        <div className="card stat"><b>{me.total}</b><span>points</span></div>
        <div className="card stat"><b>🔥 {me.streak}</b><span>streak</span></div>
        <div className="card stat"><b>{pct}%</b><span>{me.correctCount}/{me.answered} correct</span></div>
      </div>
      <section className="card">
        <UsernameForm current={me.username ?? undefined} onSaved={(u) => setMe({ ...me, username: u })} />
        <EmailToggle me={me} onChange={(v) => setMe({ ...me, emailOptIn: v })} />
      </section>
      {me.history.length > 0 && (
        <>
          <h2 className="section">History</h2>
          <ul className="card board history">
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
