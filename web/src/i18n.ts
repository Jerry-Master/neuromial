import { createContext, useContext } from 'react'

export type Lang = 'en' | 'es'
const KEY = 'neuromial:lang'

export function initialLang(): Lang {
  try {
    const s = localStorage.getItem(KEY)
    if (s === 'en' || s === 'es') return s
  } catch {
    /* ignore */
  }
  const first = (navigator.languages?.length ? navigator.languages : [navigator.language]).find((l) => /^(es|en)/i.test(l))
  return first && /^es/i.test(first) ? 'es' : 'en'
}
export function storeLang(l: Lang) {
  try {
    localStorage.setItem(KEY, l)
  } catch {
    /* ignore */
  }
}

// module-level copy so non-React code (api()) can tag requests
let current: Lang = initialLang()
export const getLang = () => current
export const setCurrentLang = (l: Lang) => { current = l }

const en = {
  'nav.leaderboard': 'Leaderboard', 'nav.profile': 'Profile', 'nav.signIn': 'Sign in', 'nav.signOut': 'Sign out',
  'lang.label': 'Language', 'lang.en': 'English', 'lang.es': 'Español',
  'signingIn': 'Signing you in…',
  'username': 'Username', 'usernamePh': 'username', 'change': 'Change', 'save': 'Save',
  'usernameHint': '3-20 letters, numbers or underscores. Shown on the leaderboard. Must be unique.',
  'pickUsername': 'Pick a username', 'pickUsernameBody': 'This is the name shown on the leaderboard.',
  'report.thanks': 'Thanks, we will check this question.', 'report.open': 'Report a problem with this question',
  'report.what': 'What is wrong?', 'report.ph': 'e.g. option B is also correct because…', 'report.send': 'Send',
  'cancel': 'Cancel', 'report.fail': 'Could not send. Try again.',
  'loadFail': 'Could not load today’s question.',
  'chooseUsername': 'Choose a username first.', 'wrong': 'Something went wrong. Try again.',
  'tagline': 'We publish one neuroanatomy question every day.',
  'streak': 'Streak', 'qotd': 'Question of the day',
  'submit': 'Submit', 'submitting': 'Submitting…', 'submitted': 'Submitted',
  'pressHint': 'Press A–D or tap an option.',
  'correctMark': 'correct', 'yourAnswer': 'your answer',
  'correct': 'Correct!', 'notQuite': 'Not quite.',
  'tryAgain': 'Try again (practice, no points)', 'practiceBadge': 'Practice — no points',
  'backToResult': 'Back to my result',
  'comeBack': 'Come back tomorrow (00:00 UTC) for a new question.',
  'anon1': 'Playing anonymously.', 'anon2': 'to earn points, keep a streak and join the leaderboard.',
  'learnMore': 'Learn more', 'yourChoice': 'Your answer', 'correctOpt': 'Correct answer',
  'share.title': 'Share result', 'share.native': 'Share…', 'share.copy': 'Copy', 'share.copied': 'Copied!',
  'lb.title': 'Leaderboard', 'lb.all': 'All time', 'lb.week': 'This week', 'lb.empty': 'No scores yet. Be the first.',
  'you': 'you', 'pts': 'pts',
  'email.label': 'Daily email', 'email.hint': 'A short reminder at 08:00 (Madrid) if you have not answered yet.',
  'saveFail': 'Could not save.', 'usernameSaveFail': 'Could not save the username.',
  'yourStats': 'Your stats', 'points': 'points', 'streakLbl': 'streak', 'correctOf': 'correct',
  'history': 'History', 'hCorrect': '✓ correct', 'hWrong': '✗ wrong',
  'err.already answered': 'You already answered today on this account.',
  'err.bad request': 'Invalid request.',
  'err.Daily email is not available yet.': 'Daily email is not available yet.',
  'err.No email on this account.': 'No email on this account.',
  'err.not found': 'Not found.',
  'err.not today’s question': 'That is not today’s question.',
  'err.That username is taken.': 'That username is taken.',
  'err.unknown question': 'Unknown question.',
  'err.Use 3-20 letters, numbers or underscores.': 'Use 3-20 letters, numbers or underscores.',
  'err.username required': 'A username is required.',
  'err.Write a short note.': 'Write a short note.',
  'diff.easy': 'easy', 'diff.medium': 'medium', 'diff.hard': 'hard',
  'sessionExpired': 'Your session expired. Sign in again.',
  'shareLine': 'neuromial',
}
type Key = keyof typeof en
const es: Record<Key, string> = {
  'nav.leaderboard': 'Clasificación', 'nav.profile': 'Perfil', 'nav.signIn': 'Entrar', 'nav.signOut': 'Salir',
  'lang.label': 'Idioma', 'lang.en': 'English', 'lang.es': 'Español',
  'signingIn': 'Iniciando sesión…',
  'username': 'Nombre de usuario', 'usernamePh': 'usuario', 'change': 'Cambiar', 'save': 'Guardar',
  'usernameHint': '3-20 letras, números o guiones bajos. Se muestra en la clasificación. Debe ser único.',
  'pickUsername': 'Elige un nombre de usuario', 'pickUsernameBody': 'Es el nombre que se muestra en la clasificación.',
  'report.thanks': 'Gracias, revisaremos esta pregunta.', 'report.open': 'Informar de un problema con esta pregunta',
  'report.what': '¿Qué falla?', 'report.ph': 'p. ej. la opción B también es correcta porque…', 'report.send': 'Enviar',
  'cancel': 'Cancelar', 'report.fail': 'No se pudo enviar. Inténtalo de nuevo.',
  'loadFail': 'No se pudo cargar la pregunta de hoy.',
  'chooseUsername': 'Elige primero un nombre de usuario.', 'wrong': 'Algo salió mal. Inténtalo de nuevo.',
  'tagline': 'Publicamos una pregunta de neuroanatomía cada día.',
  'streak': 'Racha', 'qotd': 'Pregunta del día',
  'submit': 'Enviar', 'submitting': 'Enviando…', 'submitted': 'Enviada',
  'pressHint': 'Pulsa A–D o toca una opción.',
  'correctMark': 'correcta', 'yourAnswer': 'tu respuesta',
  'correct': '¡Correcto!', 'notQuite': 'No exactamente.',
  'tryAgain': 'Inténtalo de nuevo (práctica, sin puntos)', 'practiceBadge': 'Práctica — sin puntos',
  'backToResult': 'Volver a mi resultado',
  'comeBack': 'Vuelve mañana (00:00 UTC) para una nueva pregunta.',
  'anon1': 'Estás jugando de forma anónima.', 'anon2': 'para ganar puntos, mantener una racha y entrar en la clasificación.',
  'learnMore': 'Saber más', 'yourChoice': 'Tu respuesta', 'correctOpt': 'Respuesta correcta',
  'share.title': 'Compartir resultado', 'share.native': 'Compartir…', 'share.copy': 'Copiar', 'share.copied': '¡Copiado!',
  'lb.title': 'Clasificación', 'lb.all': 'Histórico', 'lb.week': 'Esta semana', 'lb.empty': 'Aún no hay puntuaciones. Sé el primero.',
  'you': 'tú', 'pts': 'pts',
  'email.label': 'Correo diario', 'email.hint': 'Un breve recordatorio a las 08:00 (Madrid) si aún no has respondido.',
  'saveFail': 'No se pudo guardar.', 'usernameSaveFail': 'No se pudo guardar el nombre de usuario.',
  'yourStats': 'Tus estadísticas', 'points': 'puntos', 'streakLbl': 'racha', 'correctOf': 'correctas',
  'history': 'Historial', 'hCorrect': '✓ correcta', 'hWrong': '✗ incorrecta',
  'err.already answered': 'Ya has respondido hoy con esta cuenta.',
  'err.bad request': 'Solicitud no válida.',
  'err.Daily email is not available yet.': 'El correo diario aún no está disponible.',
  'err.No email on this account.': 'Esta cuenta no tiene correo.',
  'err.not found': 'No encontrado.',
  'err.not today’s question': 'Esa no es la pregunta de hoy.',
  'err.That username is taken.': 'Ese nombre de usuario ya está en uso.',
  'err.unknown question': 'Pregunta desconocida.',
  'err.Use 3-20 letters, numbers or underscores.': 'Usa 3-20 letras, números o guiones bajos.',
  'err.username required': 'Se necesita un nombre de usuario.',
  'err.Write a short note.': 'Escribe una nota breve.',
  'diff.easy': 'fácil', 'diff.medium': 'media', 'diff.hard': 'difícil',
  'sessionExpired': 'Tu sesión ha caducado. Vuelve a entrar.',
  'shareLine': 'neuromial',
}
export const dict = { en, es }

export type TFn = (k: Key, vars?: Record<string, string | number>) => string
export type I18n = { lang: Lang; setLang: (l: Lang, user?: boolean) => void; t: TFn; locale: string; err: (e?: string, fallback?: Key) => string }
export const I18nCtx = createContext<I18n>(null as unknown as I18n)
export const useT = () => useContext(I18nCtx)
export function makeT(lang: Lang): TFn {
  return (k, vars) => {
    let s: string = dict[lang][k] ?? en[k] ?? k
    if (vars) for (const [a, b] of Object.entries(vars)) s = s.replace(`{${a}}`, String(b))
    return s
  }
}
export function makeErr(lang: Lang) {
  return (e?: string, fallback: Key = 'wrong') => {
    const k = `err.${e}` as Key
    return e && k in dict[lang] ? dict[lang][k] : dict[lang][fallback]
  }
}
