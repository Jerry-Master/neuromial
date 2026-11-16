import { useEffect, useState } from 'react'
import { HashRouter, Link, Route, Routes, useNavigate } from 'react-router-dom'
import {
  api, getToken, handleCallback, localStreak, login, loadHistory, logout,
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

function Today() {
  const loggedIn = useLoggedIn()
  const [day, setDay] = useState('')
  const [q, setQ] = useState<Question | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api<{ day: string; question: Question }>('/today')
      .then((r) => {
        if (!r.data.question) throw new Error('no question')
        setDay(r.data.day)
        setQ(r.data.question)
        setResult(loadHistory()[r.data.day] ?? null)
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
      saveResult(day, r)
      setResult(r)
    } else if (status === 409 && data.previous) {
      setError('You already answered today on this account.')
    } else {
      setError('Something went wrong. Try again.')
    }
  }

  if (!q) return <p>{error || 'Loading…'}</p>
  return (
    <>
      <p className="meta">{day} · streak {localStreak()} 🔥</p>
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
          <p className="meta">Come back tomorrow (UTC) for a new question.</p>
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
      <h1>Your stats</h1>
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
