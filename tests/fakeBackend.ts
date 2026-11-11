// Keaan Mirchandani
// A fake backend for the app tests, so they run without the C++ server.
import { vi } from 'vitest';
import courseData from '../src/data/courses.json';
import requirementData from '../src/data/requirements.json';

export interface SavedPlan {
  lastSaved: string;
  courses: { code: string; quarter: number; status: string }[];
}

// The one account that exists, and its password.
export const ACCOUNT = { email: 'ana@scu.edu', startYear: 2025 };
export const PASSWORD = 'correct horse';

// A fake backend. `saved` is the plan it starts with, `saveError` makes PUT fail, and
// `saveDelayMs` makes each PUT take that long. It starts logged in as ACCOUNT unless
// `loggedIn` is false.
//
// It returns the PUT bodies, with extras: `mostAtOnce` is the most PUTs in flight at the
// same time, `posts` records each POST as { url, body }, and `endSession()` ends the
// session on the server, as if it expired.
export function fakeBackend({ saved, saveError, saveDelayMs = 0, loggedIn = true }: {
  saved?: SavedPlan;
  saveError?: string;
  saveDelayMs?: number;
  loggedIn?: boolean;
} = {}) {
  let me: typeof ACCOUNT | null = loggedIn ? ACCOUNT : null;
  let inFlight = 0;
  const puts = Object.assign([] as unknown[], {
    mostAtOnce: 0,
    posts: [] as { url: string; body: unknown }[],
    endSession: () => {
      me = null;
    },
  });
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  const loggedOut = () => json(401, { error: 'You need to log in' });

  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (init?.method === 'POST') puts.posts.push({ url, body });

    if (url === '/api/courses') return json(200, courseData);
    if (url === '/api/requirements') {
      return json(200, requirementData.map((r, i) => ({ requirementId: i + 1, count: r.courses.length, ...r })));
    }
    if (url === '/api/me') return me ? json(200, me) : loggedOut();
    if (url === '/api/login') {
      if (body.email !== ACCOUNT.email || body.password !== PASSWORD) return json(401, { error: 'Wrong email or password' });
      me = ACCOUNT;
      return json(200, me);
    }
    if (url === '/api/signup') {
      if (body.email === ACCOUNT.email) return json(409, { error: 'An account with that email already exists' });
      if (body.password.length < 8) return json(400, { error: 'Password must be at least 8 characters' });
      me = { email: body.email, startYear: body.startYear };
      return json(201, me);
    }
    if (url === '/api/logout') {
      me = null;
      return new Response(null, { status: 204 });
    }
    if (url !== '/api/me/plan') return json(404, { error: 'Not found' });
    if (!me) return loggedOut();
    if (init?.method === 'PUT') {
      puts.push(body);
      puts.mostAtOnce = Math.max(puts.mostAtOnce, ++inFlight);
      await new Promise((resolve) => setTimeout(resolve, saveDelayMs));
      inFlight--;
      return saveError ? json(400, { error: saveError }) : json(200, { planId: 1, lastSaved: '2026-11-02T20:00:00.000Z' });
    }
    return saved ? json(200, { planId: 1, ...saved }) : json(404, { error: 'Plan not found' });
  });
  return puts;
}
