import { Injectable } from '@nestjs/common';

/** The only place the application asks what time it is, so tests can fix it. */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }

  /** Today's calendar date (YYYY-MM-DD) in the given IANA time zone. */
  today(timeZone = 'Asia/Kolkata'): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(this.now());
  }
}
