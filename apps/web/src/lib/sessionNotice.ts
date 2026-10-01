import type { SessionEndReason } from './api'

const SESSION_NOTICE_KEY = 'artbh_session_notice'

const SESSION_NOTICES: Record<SessionEndReason, string> = {
  suspended: 'This business has been suspended. Please contact ArtBH support.',
  expired: 'Your session has ended. Please log in again.',
}

/** Why the last session ended, for the login page. Read, then clear once shown. */
export function readSessionNotice(): string | null {
  try {
    return sessionStorage.getItem(SESSION_NOTICE_KEY)
  } catch {
    return null
  }
}

export function clearSessionNotice() {
  try {
    sessionStorage.removeItem(SESSION_NOTICE_KEY)
  } catch {
    // nothing to clear
  }
}

export function saveSessionNotice(reason: SessionEndReason) {
  try {
    sessionStorage.setItem(SESSION_NOTICE_KEY, SESSION_NOTICES[reason])
  } catch {
    // Storage unavailable: the login page just won't say why.
  }
}
