import { TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ThemeService } from './theme.service';

const STORAGE_KEY = 'eyelecture.theme';

/** Pretends the operating system is set to dark. */
const mockPrefersDark = (matches: boolean) => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('dark') ? matches : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
};

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  const create = () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [ThemeService] });
    return TestBed.inject(ThemeService);
  };

  it('starts in light with nothing stored', () => {
    const service = create();
    expect(service.theme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('still starts in light when the OS prefers dark', () => {
    // The whole point of the rule: the OS setting must not decide for us.
    mockPrefersDark(true);
    const service = create();
    expect(service.theme()).toBe('light');
  });

  it('remembers an explicit switch to dark', () => {
    const service = create();
    service.toggle();

    expect(service.theme()).toBe('dark');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('restores a stored dark choice on the next visit', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    const service = create();

    expect(service.theme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('restores a stored light choice even when the OS prefers dark', () => {
    localStorage.setItem(STORAGE_KEY, 'light');
    mockPrefersDark(true);

    expect(create().theme()).toBe('light');
  });

  it('toggles back to light and remembers that too', () => {
    localStorage.setItem(STORAGE_KEY, 'dark');
    const service = create();
    service.toggle();

    expect(service.theme()).toBe('light');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
  });

  it('ignores a corrupted stored value', () => {
    localStorage.setItem(STORAGE_KEY, 'neon');
    expect(create().theme()).toBe('light');
  });

  it('sets color-scheme so native controls follow', () => {
    const service = create();
    expect(document.documentElement.style.colorScheme).toBe('light');
    service.set('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });
});
