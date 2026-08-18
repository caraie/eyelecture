/**
 * Email templates.
 *
 * Written as inline-styled tables on purpose. Mail clients are not browsers: Outlook
 * renders with Word, Gmail strips <style> blocks, and none of them support the CSS
 * variables the app is built on. So the design system tokens are pasted in as literal
 * hex here — the same values, just resolved by hand, because there is nowhere for a
 * variable to live.
 */

const OCULAR_BLUE = '#1b4fd1';
const INK = '#0f172a';
const MUTED = '#4b5566';
const FAINT = '#6b7789';
const HAIRLINE = '#dfe5ee';
const CANVAS = '#f6f8fb';
const SURFACE = '#ffffff';

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export interface Rendered {
  subject: string;
  html: string;
  text: string;
}

/** Escapes anything that came from a user before it goes near the HTML part. */
const esc = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * One shell for every message: brand line, a heading, the body, a single button,
 * then a footer. Anything that needs more structure than this probably should not
 * be an email.
 */
function shell(opts: {
  heading: string;
  intro: string;
  buttonLabel: string;
  buttonUrl: string;
  after: string;
  footer: string;
}): string {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:${CANVAS};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS};padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${SURFACE};border:1px solid ${HAIRLINE};border-radius:16px;">
<tr><td style="padding:28px 32px 0 32px;">
<p style="margin:0;font-family:${FONT};font-size:13px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${OCULAR_BLUE};">EyeLecture</p>
</td></tr>
<tr><td style="padding:12px 32px 0 32px;">
<h1 style="margin:0;font-family:${FONT};font-size:22px;line-height:1.3;color:${INK};font-weight:700;">${opts.heading}</h1>
</td></tr>
<tr><td style="padding:12px 32px 0 32px;">
<p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.6;color:${MUTED};">${opts.intro}</p>
</td></tr>
<tr><td style="padding:24px 32px 0 32px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${OCULAR_BLUE};border-radius:999px;">
<a href="${opts.buttonUrl}" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${opts.buttonLabel}</a>
</td></tr></table>
</td></tr>
<tr><td style="padding:20px 32px 0 32px;">
<p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.6;color:${FAINT};">${opts.after}</p>
</td></tr>
<tr><td style="padding:16px 32px 28px 32px;">
<p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${FAINT};word-break:break-all;">If the button does not work, paste this into your browser:<br><a href="${opts.buttonUrl}" style="color:${OCULAR_BLUE};">${opts.buttonUrl}</a></p>
</td></tr>
<tr><td style="padding:0 32px 28px 32px;border-top:1px solid ${HAIRLINE};">
<p style="margin:16px 0 0 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${FAINT};">${opts.footer}</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

/** Confirming the institutional address, which is the one that finishes signup. */
export function verifyPrimaryEmail(firstName: string, link: string): Rendered {
  const name = esc(firstName);
  return {
    subject: 'Confirm your email address',
    html: shell({
      heading: `Confirm your email, ${name}`,
      intro:
        'One click and your account is ready. This link proves the address is yours, ' +
        'which is the last thing standing between you and signing in.',
      buttonLabel: 'Confirm my email',
      buttonUrl: link,
      after: 'The link stops working after 48 hours.',
      footer:
        'You are getting this because somebody signed up for EyeLecture with this ' +
        'address. If that was not you, ignore this message and nothing happens — ' +
        'the account cannot be used until the address is confirmed.',
    }),
    text: [
      `Confirm your email, ${firstName}`,
      '',
      'One click and your account is ready. This link proves the address is yours,',
      'which is the last thing standing between you and signing in.',
      '',
      link,
      '',
      'The link stops working after 48 hours.',
      '',
      'You are getting this because somebody signed up for EyeLecture with this',
      'address. If that was not you, ignore this message and nothing happens — the',
      'account cannot be used until the address is confirmed.',
    ].join('\n'),
  };
}

/**
 * Confirming the optional personal address. Deliberately lower-key than the one
 * above: this address already signs the person in, so nothing is blocked on it and
 * the mail should not imply otherwise.
 */
export function verifySecondaryEmail(
  firstName: string,
  link: string,
): Rendered {
  const name = esc(firstName);
  return {
    subject: 'Confirm your personal email address',
    html: shell({
      heading: `Is this you, ${name}?`,
      intro:
        'This address was added to an EyeLecture account as a personal address. It ' +
        'already signs you in — confirming it just proves you can read this mailbox, ' +
        'which is what lets us use it to reach you later.',
      buttonLabel: 'Yes, confirm it',
      buttonUrl: link,
      after:
        'Nothing breaks if you ignore this. The address keeps working either way.',
      footer:
        'If you did not add this address to an EyeLecture account, somebody typed it ' +
        'by mistake. Ignoring this message leaves it unconfirmed, and you can ask an ' +
        'administrator to remove it.',
    }),
    text: [
      `Is this you, ${firstName}?`,
      '',
      'This address was added to an EyeLecture account as a personal address. It',
      'already signs you in — confirming it just proves you can read this mailbox,',
      'which is what lets us use it to reach you later.',
      '',
      link,
      '',
      'Nothing breaks if you ignore this. The address keeps working either way.',
      '',
      'If you did not add this address to an EyeLecture account, somebody typed it by',
      'mistake. Ignoring this message leaves it unconfirmed, and you can ask an',
      'administrator to remove it.',
    ].join('\n'),
  };
}
