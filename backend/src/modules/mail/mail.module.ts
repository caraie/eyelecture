import { Global, Module } from '@nestjs/common';
import { MailerService } from './mailer.service';
import { GmailTransport } from './gmail.transport';

/**
 * Global because sending mail is a leaf concern that several modules will reach for,
 * and threading it through every import list buys nothing — nobody is going to swap
 * the mailer per feature module.
 */
@Global()
@Module({
  providers: [MailerService, GmailTransport],
  exports: [MailerService],
})
export class MailModule {}
