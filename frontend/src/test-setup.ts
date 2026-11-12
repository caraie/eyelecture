/**
 * Gives the specs the `localStorage` jsdom already made for them.
 *
 * The collision is between two things that both want the name. Node 22 ships an
 * experimental web-storage global, so `'localStorage' in globalThis` is true
 * before any test runs — but it is unusable, and merely touching it prints
 * "localStorage is not available because --localstorage-file was not provided".
 * Vitest's jsdom environment then copies the window's properties onto the
 * global, and skips every key that is already there unless it is on its own
 * allow-list. `localStorage` is not on that list, so Node's dud wins and
 * jsdom's real Storage is left stranded on the window nobody can reach.
 *
 * The window is reachable, though: vitest hands the JSDOM instance over as a
 * global called `jsdom`, and that key does not collide with anything of Node's.
 * So we take the storage from there — the genuine jsdom implementation, not a
 * hand-written stand-in, which means `clear()`, the length property and the
 * storage events all behave the way the browser's does.
 *
 * Without this, two suites died on `Cannot read properties of undefined
 * (reading 'clear')` before their first assertion: the auth service, which
 * keeps the session, and the theme service, which keeps the light/dark choice.
 */
const dom = (globalThis as { jsdom?: { window?: Window & typeof globalThis } }).jsdom;

for (const key of ['localStorage', 'sessionStorage'] as const) {
  const storage = dom?.window?.[key];
  if (!storage) continue;

  Object.defineProperty(globalThis, key, {
    value: storage,
    configurable: true,
    writable: true,
  });
}
