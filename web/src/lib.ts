import { getLang } from './i18n'
export const API = import.meta.env.VITE_API_URL as string
const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN as string
const CLIENT_ID = import.meta.env.VITE_CLIENT_ID as string
const BASE = import.meta.env.BASE_URL // '/' on neuromial.com
const REDIRECT = `${location.origin}${BASE}`

// ---------- daily question (same rule as the backend) ----------
const DAY_MS = 86_400_000
export const todayEpoch = () => Math.floor(Date.now() / DAY_MS)
export const dayString = (d: number) => new Date(d * DAY_MS).toISOString().slice(0, 10)

export type Question = { id: string; type: string; prompt: string; options: string[]; tags: string[]; difficulty?: 'easy' | 'medium' | 'hard' }
export type Ref = { title: string; url: string }
export type Result = {
  correct: boolean; correctIndex: number; explanation: string; points: number; saved: boolean; choice: number; streak?: number
  feedback?: string[] | null; references?: Ref[]
}
export type Previous = { choice: number; correct: boolean; points: number; result: Omit<Result, 'choice' | 'points' | 'saved'> }
export const fromPrevious = (p: Previous): Result => ({ ...p.result, choice: p.choice, points: p.points, saved: true })

// ---------- anonymous play: answers are never persisted ----------
export type Stored = { choice: number; correct: boolean; points: number }
// drop answers saved by older versions
try { localStorage.removeItem('neuromial:history') } catch { /* ignore */ }
export const hasStoredSession = () => { try { return !!localStorage.getItem('neuromial:tokens') } catch { return false } }

// re-fetch the localized explanation for a stored choice (anonymous, nothing is saved server side)
export async function localizeResult(questionId: string, s: Stored): Promise<Result | null> {
  const { status, data } = await api<any>('/answer', { method: 'POST', body: JSON.stringify({ questionId, choice: s.choice }) }).catch(() => ({ status: 0, data: null as any }))
  if (status !== 200 || !data) return null
  return { ...data, choice: s.choice, correct: s.correct, points: s.points, saved: false }
}

// ---------- auth: Cognito hosted UI, authorization code + PKCE ----------
const TOK = 'neuromial:tokens'
type Tokens = { id_token: string; refresh_token?: string; exp: number }

const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export async function login(provider?: string) {
  sessionStorage.setItem('neuromial:provider', provider ?? '')
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)).buffer)
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  sessionStorage.setItem('neuromial:verifier', verifier)
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    scope: 'openid email profile',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  if (provider) p.set('identity_provider', provider)
  location.href = `https://${COGNITO_DOMAIN}/oauth2/authorize?${p}`
}

async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const res = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...body }),
  })
  if (!res.ok) throw new Error('token request failed')
  const t = await res.json()
  const exp = JSON.parse(atob(t.id_token.split('.')[1])).exp * 1000
  return { id_token: t.id_token, refresh_token: t.refresh_token, exp }
}

export async function handleCallback(code: string) {
  const verifier = sessionStorage.getItem('neuromial:verifier') ?? ''
  const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT, code_verifier: verifier })
  localStorage.setItem(TOK, JSON.stringify(t))
}

export async function getToken(): Promise<string | null> {
  let t: Tokens | null = null
  try {
    t = JSON.parse(localStorage.getItem(TOK) ?? 'null')
  } catch {
    t = null
  }
  if (!t) return null
  if (t.exp - 60_000 > Date.now()) return t.id_token
  if (!t.refresh_token) return logoutLocal()
  try {
    const n = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh_token })
    const merged = { ...n, refresh_token: t.refresh_token }
    localStorage.setItem(TOK, JSON.stringify(merged))
    return merged.id_token
  } catch {
    return logoutLocal()
  }
}

function logoutLocal(): null {
  localStorage.removeItem(TOK)
  return null
}

export function logout() {
  logoutLocal()
  location.href = `https://${COGNITO_DOMAIN}/logout?client_id=${CLIENT_ID}&logout_uri=${encodeURIComponent(location.origin + BASE)}`
}

// ---------- API ----------
export async function api<T>(path: string, init: RequestInit = {}, auth = false): Promise<{ status: number; data: T }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (auth) {
    const tok = await getToken()
    if (tok) headers.authorization = tok
  }
  const url = `${path}${path.includes('?') ? '&' : '?'}lang=${getLang()}`
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 15_000)
  try {
    const res = await fetch(`${API}${url}`, { ...init, headers, signal: ctl.signal })
    return { status: res.status, data: await res.json().catch(() => ({}) as T) }
  } finally {
    clearTimeout(timer)
  }
}

// GET with up to 3 tries and a short pause: covers a cold start, a flaky mobile connection or a 5xx blip
export async function apiRetry<T>(path: string, auth = false, tries = 3): Promise<{ status: number; data: T }> {
  for (let i = 1; ; i++) {
    try {
      const r = await api<T>(path, {}, auth)
      if (r.status < 500 || i >= tries) return r
    } catch (e) {
      if (i >= tries) throw e
    }
    await new Promise((ok) => setTimeout(ok, 700 * i))
  }
}

// fetched as soon as the script loads, before React renders
export const todayRequest = apiRetry<{ day: string; question: Question; previous?: Previous }>('/today')
export const prefetchedLang = getLang()
