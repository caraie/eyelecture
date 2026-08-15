import { Injectable, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'eyelecture.theme';

/**
 * Drives the `data-theme` attribute on <html>, which is what the design system's
 * dark palette hangs off. Also sets `color-scheme` so native controls (scrollbars,
 * date pickers) follow along.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly mode = signal<ThemeMode>(this.initialMode());
  readonly theme = this.mode.asReadonly();

  constructor() {
    this.apply(this.mode());
  }

  toggle(): void {
    this.set(this.mode() === 'light' ? 'dark' : 'light');
  }

  set(mode: ThemeMode): void {
    this.mode.set(mode);
    localStorage.setItem(STORAGE_KEY, mode);
    this.apply(mode);
  }

  private initialMode(): ThemeMode {
    // Only an explicit choice from the app bar is remembered. The OS setting is
    // deliberately ignored: light is the product's default presentation, and a
    // first-time visitor on a dark desktop should still land on it. Once someone
    // toggles, that choice wins on every later visit.
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;

    return 'light';
  }

  private apply(mode: ThemeMode): void {
    const root = document.documentElement;
    root.setAttribute('data-theme', mode);
    root.style.colorScheme = mode;
  }
}
