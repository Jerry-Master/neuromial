import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HashRouter, Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  api, fromPrevious, getToken, handleCallback, login, loadHistory, logout,
  saveResult, localizeResult, todayRequest, prefetchedLang, type Previous, type Question, type Result,
} from './lib'
import {
  I18nCtx, getLang, makeErr, makeT, setCurrentLang, storeLang, useT, type Lang,
} from './i18n'
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
  const { t } = useT()
  if (loggedIn === null) return null
  return (
    <button className="grim" onClick={() => (loggedIn ? logout() : login())}>
      <svg className="bg" aria-hidden="true">
        <rect className="shape" x="1" y="1" width="100%" height="100%" filter="url(#burn5)" />
      </svg>
      <Eye open={loggedIn} />
      <span>{loggedIn ? t('nav.signOut') : t('nav.signIn')}</span>
    </button>
  )
}

function LangSwitch() {
  const { lang, setLang, t } = useT()
  return (
    <div className="langsw" role="group" aria-label={t('lang.label')}>
      {(['en', 'es'] as const).map((l) => (
        <button key={l} type="button" lang={l} aria-pressed={lang === l} title={t(`lang.${l}`)} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

function Layout({ children }: { children: React.ReactNode }) {
  const loggedIn = useLoggedIn()
  const { t } = useT()
  const home = useLocation().pathname === '/'
  return (
    <div className="app">
      <Filters />
      {home ? (
        // the brand lives in the hero on the front page, so the bar is just the links, centred
        <header className="home">
          <nav>
            <NavLink to="/leaderboard">{t('nav.leaderboard')}</NavLink>
            {loggedIn && <NavLink to="/me">{t('nav.profile')}</NavLink>}
            <LangSwitch />
            <AuthButton loggedIn={loggedIn} />
          </nav>
        </header>
      ) : (
        <header>
          <div className="bar">
            <Link to="/" className="brand"><Logo /> neuromial</Link>
            <nav>
              <NavLink to="/leaderboard">{t('nav.leaderboard')}</NavLink>
              {loggedIn && <NavLink to="/me">{t('nav.profile')}</NavLink>}
              <LangSwitch />
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
  const { t, err } = useT()
  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    const { status, data } = await api<any>('/me/username', { method: 'PUT', body: JSON.stringify({ username: name.trim() }) }, true)
    setBusy(false)
    if (status === 200) onSaved(data.username)
    else setMsg(err(data.error, 'usernameSaveFail'))
  }
  return (
    <form onSubmit={save} className="username">
      <label htmlFor="uname" className="label">{t('username')}</label>
      <div className="row">
        <input id="uname" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('usernamePh')} maxLength={20} minLength={3} required autoFocus={!current} />
        <button className="primary" disabled={busy || name.trim() === current}>{current ? t('change') : t('save')}</button>
      </div>
      {msg && <p className="err" role="alert">{msg}</p>}
      <p className="hint">{t('usernameHint')}</p>
    </form>
  )
}

// Small toasted-paper button (Share, Send): offset shadow plus a scorched sheet, like Submit but smaller.
function Chip({ small, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { small?: boolean }) {
  return (
    <div className={`chip${small ? ' small' : ''}`}>
      <svg className="shade" aria-hidden="true">
        <rect className="shadow" x="5" y="5" width="100%" height="100%" filter="url(#sh5)" />
      </svg>
      <div className="face">
        <Sheet filter="burn5" />
        <button {...props}>{children}</button>
      </div>
    </div>
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
  const { t } = useT()
  if (state === 'sent') return <p className="hint">{t('report.thanks')}</p>
  if (!open) return <button className="link muted" onClick={() => setOpen(true)}>{t('report.open')}</button>
  async function send(e: React.FormEvent) {
    e.preventDefault()
    setState('busy')
    const { status } = await api('/report', { method: 'POST', body: JSON.stringify({ questionId, note }) }, true)
    setState(status === 200 ? 'sent' : 'error')
  }
  return (
    <form className="report" onSubmit={send}>
      <label htmlFor="note" className="label">{t('report.what')}</label>
      <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} required autoFocus
        placeholder={t('report.ph')} />
      <div className="row">
        <Chip small disabled={state === 'busy' || !note.trim()}>{t('report.send')}</Chip>
        <button type="button" className="quiet" onClick={() => setOpen(false)}>{t('cancel')}</button>
      </div>
      {state === 'error' && <p className="err">{t('report.fail')}</p>}
    </form>
  )
}

const SITE = `${location.origin}${import.meta.env.BASE_URL}`

const Ico = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d={d} /></svg>
)
const ICONS = {
  x: 'M17.5 3h3l-6.6 7.5L21.7 21h-6.1l-4.8-6.2L5.2 21h-3l7.1-8.1L2 3h6.2l4.3 5.7L17.5 3Zm-1 16.2h1.7L7.3 4.7H5.5l11 14.5Z',
  wa: 'M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.2 14.1c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.2-4.600-4-4.700-4.200-.1-.2-1.100-1.500-1.100-2.800s.7-2 1-2.300c.2-.3.500-.3.700-.3h.5c.2 0 .4 0 .6.500l.8 1.900c.1.200.1.300 0 .5l-.4.600c-.1.200-.3.300-.1.600.2.300.8 1.300 1.700 2.100 1.100 1 2 1.300 2.300 1.400.3.100.4.100.6-.1l.8-1c.2-.3.400-.2.600-.1l1.800.9c.3.100.5.200.5.300.1.100.1.700-.1 1.400Z',
  tg: 'M21.5 4.3 2.9 11.500c-1.300.5-1.200 1.200-.2 1.500l4.800 1.500 1.800 5.600c.2.600.1.800.7.800.5 0 .7-.2 1-.5l2.300-2.300 4.700 3.500c.9.500 1.500.2 1.700-.8L22.800 5.700c.3-1.200-.5-1.800-1.300-1.400ZM8.600 13.600l9.700-6.100c.5-.3.900-.1.500.2l-8.100 7.300-.3 3.400-1.800-4.800Z',
  fb: 'M13.500 22v-8.200h2.800l.4-3.300h-3.200V8.400c0-.9.300-1.600 1.600-1.600h1.700V3.900c-.3 0-1.300-.1-2.500-.1-2.500 0-4.200 1.500-4.200 4.300v2.400H7.300v3.300h2.800V22h3.400Z',
  li: 'M4.500 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM3 8.500h3V21H3V8.500Zm5.500 0h2.900v1.700c.5-.9 1.700-2 3.600-2 3.300 0 3.900 2.100 3.900 5V21h-3v-6.800c0-1.400 0-3.100-1.900-3.100s-2.200 1.500-2.200 3V21H8.500V8.500Z',
  rd: 'M22 12.100a2.200 2.200 0 0 0-3.700-1.600c-1.400-.9-3.200-1.500-5.200-1.500l.9-4.100 2.900.6a1.600 1.600 0 1 0 .2-1l-3.500-.8c-.3-.1-.5.100-.6.400l-1 4.900c-2 .1-3.900.6-5.300 1.600A2.200 2.200 0 1 0 4 14c0 .2-.1.400-.1.700 0 3 3.500 5.500 7.900 5.500s7.900-2.400 7.900-5.500c0-.2 0-.5-.1-.7.800-.4 1.400-1.100 1.400-2Zm-14.500 1.600a1.500 1.500 0 1 1 3 0 1.500 1.500 0 0 1-3 0Zm8.200 3.900c-1 1-3 1-3.700 1s-2.700 0-3.700-1a.4.400 0 0 1 .6-.6c.6.600 2 .8 3.100.8s2.500-.2 3.100-.8a.4.4 0 0 1 .6.600Zm-.3-2.400a1.500 1.500 0 1 1 0-3 1.500 1.500 0 0 1 0 3Z',
  bs: 'M6.300 4.100C8.500 5.700 10.900 9 12 11c1.100-2 3.500-5.300 5.700-6.900 1.600-1.200 4.300-2.100 4.300.8 0 .6-.3 4.900-.5 5.600-.7 2.400-3.100 3-5.300 2.700 3.800.7 4.800 2.800 2.700 5-4 4.100-5.800-1-6.200-2.300-.1-.2-.1-.3-.1-.2 0-.1 0 0-.1.200-.4 1.300-2.200 6.400-6.200 2.300-2.100-2.200-1.100-4.300 2.700-5-2.200.3-4.600-.3-5.300-2.700C2.300 9.800 2 5.500 2 4.900c0-2.900 2.700-2 4.300-.8Z',
  copy: 'M8 3h10a2 2 0 0 1 2 2v12h-2V5H8V3ZM5 7h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z',
  share: 'M18 16.100c-.8 0-1.500.3-2 .8l-7.100-4.200a3 3 0 0 0 0-1.400L16 7.200A3 3 0 1 0 15 5c0 .2 0 .5.100.7L8 9.900a3 3 0 1 0 0 4.200l7.200 4.200a2.800 2.800 0 0 0-.1.700 2.900 2.900 0 1 0 2.900-2.900Z',
}

function SharePanel({ text }: { text: string }) {
  const { t } = useT()
  const [copied, setCopied] = useState(false)
  const e = encodeURIComponent
  const canNative = typeof navigator.share === 'function'
  const links: [string, keyof typeof ICONS, string][] = [
    ['X', 'x', `https://twitter.com/intent/tweet?text=${e(text)}`],
    ['WhatsApp', 'wa', `https://wa.me/?text=${e(text)}`],
    ['Telegram', 'tg', `https://t.me/share/url?url=${e(SITE)}&text=${e(text)}`],
    ['Facebook', 'fb', `https://www.facebook.com/sharer/sharer.php?u=${e(SITE)}`],
    ['LinkedIn', 'li', `https://www.linkedin.com/sharing/share-offsite/?url=${e(SITE)}`],
    ['Reddit', 'rd', `https://www.reddit.com/submit?url=${e(SITE)}&title=${e(text.split('\n')[0])}`],
    ['Bluesky', 'bs', `https://bsky.app/intent/compose?text=${e(text)}`],
  ]
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable */
    }
  }
  async function native() {
    try {
      await navigator.share({ text })
    } catch {
      /* dismissed */
    }
  }
  return (
    <div className="sharepanel">
      <p className="label">{t('share.title')}</p>
      <div className="sharelinks">
        {canNative && (
          <button type="button" className="sbtn" onClick={native}><Ico d={ICONS.share} />{t('share.native')}</button>
        )}
        {links.map(([name, ic, href]) => (
          <a key={name} className="sbtn" href={href} target="_blank" rel="noopener noreferrer"><Ico d={ICONS[ic]} />{name}</a>
        ))}
        <button type="button" className="sbtn" onClick={copy} aria-live="polite"><Ico d={ICONS.copy} />{copied ? t('share.copied') : t('share.copy')}</button>
      </div>
    </div>
  )
}

function Today() {
  const loggedIn = useLoggedIn()
  const { t, err, lang, locale, setLang } = useT()
  const [day, setDay] = useState('')
  const [q, setQ] = useState<Question | null>(null)
  const [result, setResult] = useState<Result | null>(null) // the real, saved first result
  const [practice, setPractice] = useState<Result | null>(null)
  const [practicing, setPracticing] = useState(false)
  const [error, setError] = useState('')
  // Answering is two steps: pick an option (selected), then press Submit (submitting -> result).
  const [selected, setSelected] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [me, setMe] = useState<any>(null)
  const questionId = q?.id
  const usedPrefetch = useRef(false)

  useEffect(() => {
    if (!loggedIn) return
    api<any>('/me', {}, true).then((r) => {
      setMe(r.data)
      let override: string | null = null
      try { override = localStorage.getItem('neuromial:lang') } catch { /* ignore */ }
      const l = r.data?.lang
      if ((l === 'en' || l === 'es') && !override) {
        if (l !== getLang()) setLang(l, false)
      } else if (!l && r.status === 200) {
        api('/me/lang', { method: 'PUT', body: JSON.stringify({ lang: getLang() }) }, true).catch(() => undefined)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn])

  // load today's question (localized); signed in also returns `previous`
  useEffect(() => {
    if (loggedIn === null) return
    let live = true
    const req =
      !loggedIn && !usedPrefetch.current && prefetchedLang === lang
        ? todayRequest
        : api<{ day: string; question: Question; previous?: Previous }>(loggedIn ? '/me/today' : '/today', {}, loggedIn)
    usedPrefetch.current = true
    req
      .then((r) => {
        if (!live) return
        if (!r.data.question) throw new Error('no question')
        setDay(r.data.day)
        setQ(r.data.question)
        setError('')
        if (loggedIn && r.data.previous) {
          const p = fromPrevious(r.data.previous)
          setResult(p)
          setSelected(p.choice)
        }
      })
      .catch(() => live && setError(t('loadFail')))
    return () => { live = false }
  }, [loggedIn, lang, t])

  // signed out: restore today's locally stored choice and re-fetch the localized result (also on language change)
  useEffect(() => {
    if (loggedIn !== false || !day || !questionId) return
    const saved = loadHistory()[day]
    if (!saved) { setResult(null); return }
    setSelected(saved.choice)
    let live = true
    localizeResult(questionId, saved).then((r) => {
      if (live) setResult(r ?? { correct: saved.correct, correctIndex: saved.choice, explanation: '', points: saved.points, saved: false, choice: saved.choice })
    })
    return () => { live = false }
  }, [loggedIn, day, questionId, lang])

  // practice result: re-localize on language switch
  const practiceChoice = practice?.choice
  useEffect(() => {
    if (practiceChoice === undefined || !questionId) return
    let live = true
    localizeResult(questionId, { choice: practiceChoice, correct: false, points: 0 }).then((r) => {
      if (live && r) setPractice((p) => (p && p.choice === practiceChoice ? { ...r, correct: p.correct } : p))
    })
    return () => { live = false }
  }, [lang, practiceChoice, questionId])

  const shown = practicing ? practice : result
  const locked = !!shown || submitting

  // choosing only highlights the option; nothing is sent until Submit
  const select = useCallback((choice: number) => {
    if (shown || submitting) return
    setSelected(choice)
    setError('')
  }, [shown, submitting])

  const submit = useCallback(async () => {
    if (!q || selected === null || shown || submitting) return
    const choice = selected
    setSubmitting(true)
    setError('')
    const wasLoggedIn = !!loggedIn
    const scored = !practicing && !!(await getToken())
    if (!practicing && wasLoggedIn && !scored) {
      setSubmitting(false)
      setError(t('sessionExpired'))
      return
    }
    const { status, data } = await api<any>(
      scored ? '/answer/scored' : '/answer',
      { method: 'POST', body: JSON.stringify({ questionId: q.id, choice }) },
      scored,
    ).catch(() => ({ status: 0, data: {} as any }))
    setSubmitting(false)
    if (status === 200) {
      const r: Result = { points: 0, saved: false, ...data, choice }
      if (practicing) setPractice(r)
      else {
        if (r.saved) setMe((m: any) => (m ? { ...m, streak: r.streak ?? m.streak } : m))
        else saveResult(day, r)
        setResult(r)
      }
    } else if (status === 403) {
      setError(t('chooseUsername'))
      setMe((m: any) => (m ? { ...m, username: null } : m))
    } else if (status === 409 && data.previous) {
      const p = fromPrevious(data.previous)
      setResult(p)
      setSelected(p.choice)
      setPracticing(false)
    } else {
      setError(err(data.error))
    }
  }, [q, selected, shown, submitting, practicing, day, loggedIn, t, err])

  function tryAgain() {
    setPracticing(true)
    setPractice(null)
    setSelected(null)
    setError('')
  }
  function backToResult() {
    setPracticing(false)
    setPractice(null)
    setSelected(result?.choice ?? null)
  }

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

  if (!q) return error ? <p className="err">{error}</p> : <div className="card skeleton" aria-busy="true" />
  if (loggedIn && me && !me.username) {
    return (
      <section className="card">
        <h1>{t('pickUsername')}</h1>
        <p>{t('pickUsernameBody')}</p>
        <UsernameForm onSaved={(u) => setMe({ ...me, username: u })} />
      </section>
    )
  }
  const pretty = day ? new Date(`${day}T00:00:00Z`).toLocaleDateString(locale, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }) : ''
  // Submit has three looks: not ready (nothing picked), busy, and submitted
  const submitState = shown ? 'done' : submitting ? 'busy' : selected === null ? 'off' : 'ready'
  const submitLabel = shown ? t('submitted') : submitting ? t('submitting') : t('submit')
  return (
    <>
      <div className="hero">
        <LogoMark size={84} />
        <h1 className="wordmark">neuromial</h1>
        <p className="tagline">{t('tagline')}</p>
      </div>
      <div className="kicker">
        <span>{pretty}</span>
        {q.difficulty && (
          <span className={`pill ${q.difficulty}`}>
            <svg aria-hidden="true"><rect x="1" y="1" width="100%" height="100%" filter="url(#roughS)" /></svg>
            <span>{t(`diff.${q.difficulty}`)}</span>
          </span>
        )}
        {loggedIn && me && <span className="streak" title={t('streak')}><Flame size={18} /> {me.streak}</span>}
      </div>
      <section className="question">
        <p className="eyebrow">{t('qotd')}</p>
        <h2 className="prompt">{q.prompt}</h2>
        <ul className="options">
          {q.options.map((o, i) => {
            let cls = ''
            if (shown) cls = i === shown.correctIndex ? 'right' : i === shown.choice ? 'wrong' : 'dim'
            else if (selected === i) cls = 'sel'
            const n = (i % 4) + 1
            const fb = shown?.feedback?.[i]
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
                    {shown && i === shown.correctIndex && <span className="mark" aria-label={t('correctMark')}>✓</span>}
                    {shown && !shown.correct && i === shown.choice && <span className="mark" aria-label={t('yourAnswer')}>✗</span>}
                  </button>
                  {fb && (
                    <p className="optfb">
                      {(i === shown!.correctIndex || i === shown!.choice) && (
                        <strong>{i === shown!.correctIndex ? t('correctOpt') : t('yourChoice')}. </strong>
                      )}
                      {fb}
                    </p>
                  )}
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
        {!shown && <p className="hint center">{t('pressHint')}</p>}
        {error && <p className="err" role="alert">{error}</p>}
      </section>
      {shown && (
        <>
          <section className={`result ${shown.correct ? 'ok' : 'bad'}`} aria-live="polite">
            <div className="glow" aria-hidden="true" />
            <div className="inner">
              {practicing && <p className="practice-badge">{t('practiceBadge')}</p>}
              <div className="verdict">
                <span className="vicon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d={shown.correct ? 'M4 12.5 9.5 18 20 6.5' : 'M6 6l12 12M18 6 6 18'} />
                  </svg>
                </span>
                <h2>{shown.correct ? t('correct') : t('notQuite')}</h2>
                {!practicing && shown.saved && shown.points > 0 && <span className="burst">+{shown.points}</span>}
              </div>
              <p>{shown.explanation}</p>
              {shown.references && shown.references.length > 0 && (
                <div className="refs">
                  <p className="label">{t('learnMore')}</p>
                  <ul>
                    {shown.references.map((r) => (
                      <li key={r.url}><a href={r.url} target="_blank" rel="noopener noreferrer">{r.title}</a></li>
                    ))}
                  </ul>
                </div>
              )}
              <SharePanel text={shareText(day, shown, me?.streak)} />
              <div className="row">
                <button type="button" className="underline" onClick={tryAgain}>{t('tryAgain')}</button>
                {practicing && <button type="button" className="underline" onClick={backToResult}>{t('backToResult')}</button>}
              </div>
              {!practicing && shown.saved && <p className="hint">{t('comeBack')}</p>}
            </div>
          </section>
          <section className="aside">
            <div className="glow" aria-hidden="true" />
            {loggedIn === false && (
              <p>
                {t('anon1')} <button className="link" onClick={() => login()}>{t('nav.signIn')}</button> {t('anon2')}
              </p>
            )}
            <div className="more"><ReportForm questionId={q.id} /></div>
          </section>
        </>
      )}
    </>
  )
}

// each answer sits a hair off-level, like pieces cut by hand
const ROTATE = [-0.35, 0.3, -0.2, 0.4]

type Row = { name: string; total: number; streak: number }

// Used by both tabs (all time and this week): same rows, same bands.
function Leaderboard() {
  const { t, lang } = useT()
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
  }, [period, lang])
  return (
    <>
      <h1 className="page">{t('lb.title')}</h1>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={period === 'all'} onClick={() => { if (period !== 'all') { setRows(null); setPeriod('all') } }}>{t('lb.all')}</button>
        <button role="tab" aria-selected={period === 'week'} onClick={() => { if (period !== 'week') { setRows(null); setPeriod('week') } }}>{t('lb.week')}</button>
      </div>
      {!rows ? <div className="card skeleton" aria-busy="true" /> : rows.length === 0 ? (
        <p className="card">{t('lb.empty')}</p>
      ) : (
        <ol className="bands board">
          {rows.map((r, i) => (
            <li key={r.name} className={r.name === mine ? 'me' : ''}>
              <span className="rank">{i < 3 ? <Crown place={i} /> : i + 1}</span>
              <span className="name">{r.name}{r.name === mine && <em> ({t('you')})</em>}</span>
              <span className="score">{r.total} <small>{t('pts')}</small></span>
              <span className="streakcell">{r.streak > 0 && <><Flame size={16} hole="var(--band)" />{r.streak}</>}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  )
}

function EmailToggle({ me, onChange }: { me: any; onChange: (v: boolean) => void }) {
  const { t, err } = useT()
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
    else setMsg(err(data.error, 'saveFail'))
  }
  return (
    <div className="setting">
      <div>
        <p className="label">{t('email.label')}</p>
        <p className="hint">{t('email.hint')}</p>
      </div>
      <button role="switch" aria-checked={!!me.emailOptIn} className="switch" disabled={busy} onClick={toggle}>
        <span />
      </button>
      {msg && <p className="err">{msg}</p>}
    </div>
  )
}

function Profile() {
  const { t } = useT()
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
      <h1 className="page">{me.username ?? t('yourStats')}</h1>
      <div className="stats">
        <div className="stat"><b>{me.total}</b><span>{t('points')}</span></div>
        <div className="stat"><b><Flame size={22} hole="var(--band-b)" /> {me.streak}</b><span>{t('streakLbl')}</span></div>
        <div className="stat"><b>{pct}%</b><span>{me.correctCount}/{me.answered} {t('correctOf')}</span></div>
      </div>
      <section className="plain">
        <UsernameForm current={me.username ?? undefined} onSaved={(u) => setMe({ ...me, username: u })} />
        <EmailToggle me={me} onChange={(v) => setMe({ ...me, emailOptIn: v })} />
      </section>
      {me.history.length > 0 && (
        <>
          <h2 className="section">{t('history')}</h2>
          <ul className="bands history">
            {me.history.map((h: any) => (
              <li key={h.day}>
                <span>{h.day}</span>
                <span className={h.correct ? 'okc' : 'badc'}>{h.correct ? t('hCorrect') : t('hWrong')}</span>
                <span className="score">{h.points} <small>{t('pts')}</small></span>
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
  const [lang, setLangState] = useState<Lang>(getLang())
  const i18n = useMemo(() => {
    const setLang = (l: Lang, user = true) => {
      if (l === getLang()) return
      setCurrentLang(l)
      if (user) storeLang(l)
      setLangState(l)
      if (user) getToken().then((tok) => {
        if (tok) api('/me/lang', { method: 'PUT', body: JSON.stringify({ lang: l }) }, true).catch(() => undefined)
      })
    }
    return { lang, setLang, t: makeT(lang), err: makeErr(lang), locale: lang === 'es' ? 'es-ES' : 'en-US' }
  }, [lang])
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])
  return (
    <I18nCtx.Provider value={i18n}>
      <Shell />
    </I18nCtx.Provider>
  )
}

function Shell() {
  const { t } = useT()
  if (!useOAuthReturn()) return <p className="center pad">{t('signingIn')}</p>
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
