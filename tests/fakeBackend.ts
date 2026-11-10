// Keaan Mirchandani
// A fake backend for the app tests, so they run without the C++ server.
import { vi } from 'vitest';
import courseData from '../src/data/courses.json';
import requirementData from '../src/data/requirements.json';

export interface SavedPlan {
  lastSaved: string;
  courses: { code: string; quarter: number; status: string }[];
}

// A fake backend. `saved` is the plan it starts with; `saveError` makes PUT fail.
export function fakeBackend({ saved, saveError }: { saved?: SavedPlan; saveError?: string } = {}) {
  const puts: unknown[] = [];
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url === '/api/courses') return json(200, courseData);
    if (url === '/api/requirements') {
      return json(200, requirementData.map((r, i) => ({ requirementId: i + 1, count: r.courses.length, ...r })));
    }
    if (init?.method === 'PUT') {
      puts.push(JSON.parse(String(init.body)));
      return saveError ? json(400, { error: saveError }) : json(200, { planId: 1, lastSaved: '2026-11-02T20:00:00.000Z' });
    }
    return saved ? json(200, { planId: 1, ...saved }) : json(404, { error: 'Plan not found' });
  });
  return puts;
}
