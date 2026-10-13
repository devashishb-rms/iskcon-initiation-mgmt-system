// Public surface of the notifications module. Other modules import only from here.
// Other modules do not call it: they publish domain events (shared/events.ts) and it subscribes.
export { NotificationsModule } from './notifications.module';
// Operational entry points (the scheduler calls them; tests and one-off scripts may too).
export { DeliveryWorker, type DeliveryReport } from './application/delivery-worker.service';
export { RemindersJob, type ReminderRunReport } from './application/reminders/reminders.job';
export { MESSAGE_CODES, type MessageCode, type NotificationKind } from './domain/notification-kinds';
