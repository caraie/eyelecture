import { parseDuration } from './auth.service';

describe('parseDuration', () => {
  it.each([
    ['15m', 900_000],
    ['30d', 2_592_000_000],
    ['1h', 3_600_000],
    ['45s', 45_000],
    ['2w', 1_209_600_000],
    ['3600', 3_600_000],
  ])('reads %s as %i ms', (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it('is case-insensitive and tolerates whitespace', () => {
    expect(parseDuration(' 15M ')).toBe(900_000);
  });

  it('throws on something it cannot read, rather than guessing', () => {
    expect(() => parseDuration('soon')).toThrow(/Unsupported duration/);
    expect(() => parseDuration('15 years')).toThrow(/Unsupported duration/);
  });
});
