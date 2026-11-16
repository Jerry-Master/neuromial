import { useEffect, useState } from 'react'
import { HashRouter, Link, Route, Routes, useNavigate } from 'react-router-dom'
import {
  api, clearHistory, getToken, handleCallback, login, loadHistory, logout,
  saveResult, type Question, type Result,
} from './lib'

function useLoggedIn() {
  const [state, setState] = useState<boolean | null>(null)
  useEffect(() => {
    getToken().then((t) => setState(!!t))
  }, [])
  return state
}

function Layout({ children }: { children: React.ReactNode }) {
  const loggedIn = useLoggedIn()
  return (
    <div className="app">
      <header>
        <Link to="/" className="brand">🧠 neuromial</Link>
        <nav>
          <Link to="/leaderboard">Leaderboard</Link>
          {loggedIn === false && <button onClick={() => login()}>Sign in</button>}
          {loggedIn && <><Link to="/me">Profile</Link><button onClick={logout}>Sign out</button></>}
        </nav>
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
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="username" maxLength={20} minLength={3} required autoFocus />
      <button disabled={busy || name.trim() === current}>{current ? 'Change' : 'Save'}</button>
      {msg && <p className="err">{msg}</p>}
      <p className="meta">3-20 letters, numbers or underscores. Shown on the leaderboard. Must be unique.</p>
    </form>
  )
}

function Today() {
  const loggedIn = useLoggedIn()
  const [day, setDay] = useState('')
  const [q, setQ] = useState<Question | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [me, setMe] = useState<any>(null)

  useEffect(() => {
    if (loggedIn) api('/me', {}, true).then((r) => setMe(r.data))
    if (loggedIn === false) clearHistory() // anonymous play is never remembered
  }, [loggedIn])

  // signed-in users get one scored attempt per day, so restore today's saved result
  useEffect(() => {
    if (loggedIn && day) setResult(loadHistory()[day] ?? null)
  }, [loggedIn, day])

  useEffect(() => {
    api<{ day: string; question: Question }>('/today')
      .then((r) => {
        if (!r.data.question) throw new Error('no question')
        setDay(r.data.day)
        setQ(r.data.question)
      })
      .catch(() => setError('Could not load today’s question.'))
  }, [])

  async function choose(choice: number) {
    if (!q || result || busy) return
    setBusy(true)
    setError('')
    const scored = !!(await getToken())
    const { status, data } = await api<any>(
      scored ? '/answer/scored' : '/answer',
      { method: 'POST', body: JSON.stringify({ questionId: q.id, choice }) },
      scored,
    )
    setBusy(false)
    if (status === 200) {
      const r: Result = { ...data, choice }
      if (r.saved) saveResult(day, r)
      setResult(r)
    } else if (status === 403) {
      setError('Choose a username first.')
      setMe((m: any) => (m ? { ...m, username: null } : m))
    } else if (status === 409 && data.previous) {
      setError('You already answered today on this account.')
    } else {
      setError('Something went wrong. Try again.')
    }
  }

  if (!q) return <p>{error || 'Loading…'}</p>
  if (loggedIn && me && !me.username) {
    return (
      <>
        <h1>Pick a username</h1>
        <p>This is the name shown on the leaderboard.</p>
        <UsernameForm onSaved={(u) => setMe({ ...me, username: u })} />
      </>
    )
  }
  return (
    <>
      <p className="meta">{day}{loggedIn && me ? ` · streak ${me.streak} 🔥` : ''}</p>
      <h1>{q.prompt}</h1>
      <ul className="options">
        {q.options.map((o, i) => {
          let cls = ''
          if (result) cls = i === result.correctIndex ? 'right' : i === result.choice ? 'wrong' : 'dim'
          return (
            <li key={i}>
              <button className={cls} disabled={!!result || busy} onClick={() => choose(i)}>
                <b>{'ABCD'[i]}</b> {o}
              </button>
            </li>
          )
        })}
      </ul>
      {error && <p className="err">{error}</p>}
      {result && (
        <section className="explain">
          <h2>{result.correct ? 'Correct!' : 'Not quite.'} {result.saved ? `+${result.points} points` : ''}</h2>
          <p>{result.explanation}</p>
          {loggedIn === false && (
            <p className="nudge">
              Playing anonymously. <button onClick={() => login()}>Sign in</button> to earn points and join the leaderboard.
            </p>
          )}
          {result.saved ? (
            <p className="meta">Come back tomorrow (UTC) for a new question.</p>
          ) : (
            <p><button onClick={() => setResult(null)}>Try again</button></p>
          )}
        </section>
      )}
    </>
  )
}

function Leaderboard() {
  const [rows, setRows] = useState<{ name: string; total: number; streak: number }[] | null>(null)
  useEffect(() => {
    api<{ top: any[] }>('/leaderboard').then((r) => setRows(r.data.top ?? []))
  }, [])
  if (!rows) return <p>Loading…</p>
  return (
    <>
      <h1>Leaderboard</h1>
      {rows.length === 0 && <p>No scores yet. Be the first.</p>}
      <ol className="board">
        {rows.map((r, i) => (
          <li key={i}><span>{r.name}</span><span>{r.total} pts · {r.streak}🔥</span></li>
        ))}
      </ol>
    </>
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
  if (!me) return <p>Loading…</p>
  return (
    <>
      <h1>{me.username ?? 'Your stats'}</h1>
      <UsernameForm current={me.username ?? undefined} onSaved={(u) => setMe({ ...me, username: u })} />
      <p>{me.total} points · streak {me.streak}🔥 · {me.correctCount}/{me.answered} correct</p>
      <ul className="board">
        {me.history.map((h: any) => (
          <li key={h.day}><span>{h.day}</span><span>{h.correct ? '✅' : '❌'} {h.points} pts</span></li>
        ))}
      </ul>
    </>
  )
}

// Cognito redirects to <site>/?code=...; finish sign-in before the router renders.
function useOAuthReturn() {
  const code = new URLSearchParams(location.search).get('code')
  const [done, setDone] = useState(!code)
  useEffect(() => {
    if (!code) return
    handleCallback(code)
      .catch(() => undefined)
      .finally(() => {
        history.replaceState(null, '', import.meta.env.BASE_URL)
        setDone(true)
      })
  }, [code])
  return done
}

export default function App() {
  if (!useOAuthReturn()) return <p>Signing you in…</p>
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
