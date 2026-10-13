/** A person who may receive a notification, reduced to what routing and rendering need. */
export interface Recipient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  /** 'en' | 'bn' | 'hi', or anything else stored on the user (rendering falls back to English). */
  locale: string;
}
