import { Injectable, Logger } from '@nestjs/common';

const METADATA_ROOT =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

export interface OutgoingMail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Sends through Gmail as a Workspace user, using domain-wide delegation.
 *
 * Deliberately keyless. The usual recipe for delegation downloads a service-account
 * JSON key and ships it as a secret, which trades a short-lived credential for a
 * long-lived one that is only as safe as everywhere it has ever been copied. Instead
 * this asks Google to sign the assertion for us:
 *
 *   1. the metadata server hands out a token for the runtime identity
 *   2. IAM Credentials signs a JWT claiming "act as <impersonated user>"
 *   3. that JWT is traded for an access token scoped to gmail.send only
 *
 * Nothing secret is ever stored. The corresponding cost is two extra round trips on
 * a cold token, which is why tokens are cached until shortly before they expire.
 *
 * Setup this depends on, none of which can be done from code:
 *   - the IAM Credentials and Gmail APIs enabled on the project
 *   - the runtime service account holding roles/iam.serviceAccountTokenCreator on
 *     itself, so it is allowed to sign its own assertions
 *   - that service account's numeric client ID authorised in the Google Workspace
 *     admin console for exactly the gmail.send scope
 *
 * Only runs on Google infrastructure — the metadata server does not exist locally,
 * which is why local development uses the logging transport instead.
 */
@Injectable()
export class GmailTransport {
  private readonly logger = new Logger(GmailTransport.name);

  private serviceAccountEmail: string | null = null;
  private cached: { token: string; expiresAt: number } | null = null;

  async send(
    mail: OutgoingMail,
    from: string,
    impersonate: string,
  ): Promise<void> {
    const accessToken = await this.accessTokenFor(impersonate);
    const raw = base64Url(buildMimeMessage(mail, from));

    const response = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw }),
      },
    );

    if (!response.ok) {
      // The body carries the actionable part — a delegation that was never granted
      // reads as "unauthorized_client", which is otherwise very hard to guess.
      throw new Error(
        `Gmail refused the message (${response.status}): ${await response.text()}`,
      );
    }
  }

  // --- Token plumbing ---------------------------------------------------------

  private async accessTokenFor(impersonate: string): Promise<string> {
    // 60s of slack, so a token cannot expire between this check and the send.
    if (this.cached && this.cached.expiresAt > Date.now() + 60_000) {
      return this.cached.token;
    }

    const saEmail = await this.runtimeServiceAccountEmail();
    const now = Math.floor(Date.now() / 1000);
    const claims = {
      iss: saEmail,
      sub: impersonate,
      scope: GMAIL_SEND_SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    };

    const signedJwt = await this.signJwt(saEmail, claims);

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: signedJwt,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Could not exchange the assertion for a token (${response.status}): ` +
          `${await response.text()}`,
      );
    }

    const body = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };

    this.cached = {
      token: body.access_token,
      expiresAt: Date.now() + body.expires_in * 1000,
    };
    return body.access_token;
  }

  /** Has IAM Credentials sign the assertion, so no private key lives here. */
  private async signJwt(
    saEmail: string,
    claims: Record<string, unknown>,
  ): Promise<string> {
    const metadataToken = await this.metadata('token');
    const { access_token: adcToken } = JSON.parse(metadataToken) as {
      access_token: string;
    };

    const response = await fetch(
      `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${saEmail}:signJwt`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adcToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ payload: JSON.stringify(claims) }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `IAM Credentials would not sign the assertion (${response.status}): ` +
          `${await response.text()}. The runtime service account most likely lacks ` +
          `roles/iam.serviceAccountTokenCreator on itself.`,
      );
    }

    return ((await response.json()) as { signedJwt: string }).signedJwt;
  }

  private async runtimeServiceAccountEmail(): Promise<string> {
    this.serviceAccountEmail ??= await this.metadata('email');
    return this.serviceAccountEmail;
  }

  private async metadata(path: string): Promise<string> {
    const response = await fetch(`${METADATA_ROOT}/${path}`, {
      headers: { 'Metadata-Flavor': 'Google' },
    });
    if (!response.ok) {
      throw new Error(
        `The metadata server did not answer for "${path}" (${response.status}). ` +
          `This transport only works on Google infrastructure.`,
      );
    }
    return response.text();
  }
}

// --- Message construction ------------------------------------------------------

/** base64url, which is what the Gmail API wants rather than plain base64. */
const base64Url = (value: string): string =>
  Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

/**
 * RFC 2047 encoded-word. Without it a subject containing an accent arrives mojibake,
 * which matters here because half the copy is in Spanish.
 */
const encodeHeader = (value: string): string =>
  /^[\x20-\x7E]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;

/**
 * multipart/alternative with both parts. The plain-text half is not decoration:
 * some clients show it, and a mail with no text part scores worse with spam filters.
 * Both parts are base64 so no line-length or encoding rule can corrupt them.
 */
export function buildMimeMessage(mail: OutgoingMail, from: string): string {
  const boundary = `eyelecture_${Date.now().toString(36)}`;
  const b64 = (value: string) =>
    Buffer.from(value, 'utf8')
      .toString('base64')
      .replace(/(.{76})/g, '$1\r\n');

  return [
    `From: ${from}`,
    `To: ${mail.to}`,
    `Subject: ${encodeHeader(mail.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    b64(mail.text),
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    b64(mail.html),
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');
}
