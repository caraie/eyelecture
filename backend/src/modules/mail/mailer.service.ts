import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GmailTransport, OutgoingMail } from './gmail.transport';

/**
 * The one place that decides whether a message actually leaves the building.
 *
 * Three gates, in order, and all three fail *safe* — every one of them degrades to
 * "logged, not sent" rather than to "sent to the wrong person":
 *
 *   1. MAIL_ENABLED off        — the default, so a half-configured deploy sends nothing
 *   2. recipient not allowed   — MAIL_ALLOWED_DOMAINS, when it is set
 *   3. the send itself throws  — swallowed, because a mail provider having a bad
 *                                afternoon must not fail somebody's signup
 *
 * The link is always written to the log, sent or not. That is what keeps the flow
 * testable when mail is off, and it is how you find the link again when a message
 * was dropped.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly gmail: GmailTransport,
  ) {}

  /**
   * Never throws. Callers are mid-signup and mid-profile-edit; whether a
   * notification went out is not their problem and must not undo their work.
   */
  async send(mail: OutgoingMail, context: string): Promise<void> {
    const enabled = this.config.get<boolean>('mail.enabled') ?? false;

    if (!enabled) {
      this.logger.log(`[mail off] ${context} for ${mail.to}`);
      return;
    }

    if (!this.isAllowed(mail.to)) {
      this.logger.warn(
        `[mail blocked] ${context} for ${mail.to} — not on MAIL_ALLOWED_DOMAINS`,
      );
      return;
    }

    const from = this.config.get<string>('mail.from') ?? '';
    const impersonate = this.config.get<string>('mail.impersonate') ?? '';

    if (!impersonate) {
      this.logger.error(
        `[mail misconfigured] MAIL_IMPERSONATE is empty, so nothing can be sent. ` +
          `Gmail sends as a user, and there is no user to send as.`,
      );
      return;
    }

    try {
      await this.gmail.send(mail, from, impersonate);
      this.logger.log(`[mail sent] ${context} to ${mail.to}`);
    } catch (error) {
      // Logged loudly and swallowed. The verification link is recoverable — an
      // admin can resend it, or activate the account outright — but a signup that
      // blew up because Gmail hiccuped is not.
      this.logger.error(
        `[mail failed] ${context} to ${mail.to}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Empty list means no restriction. That is the current setting, and it is the
   * looser of the two — fill the list in and the app can no longer reach anything
   * outside it, which is what makes a test build safe to point at real signups.
   */
  private isAllowed(recipient: string): boolean {
    const allowed = this.config.get<string[]>('mail.allowedDomains') ?? [];
    if (allowed.length === 0) return true;

    const at = recipient.lastIndexOf('@');
    if (at === -1) return false;

    const domain = recipient.slice(at + 1).toLowerCase();
    // Subdomains count: allowing "nextto.ai" also allows "mail.nextto.ai", which is
    // what people mean when they list a domain.
    return allowed.some(
      (entry) => domain === entry || domain.endsWith(`.${entry}`),
    );
  }
}
