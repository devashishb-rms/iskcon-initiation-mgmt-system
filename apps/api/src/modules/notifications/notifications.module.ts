import { Module } from '@nestjs/common';
import { CandidatesModule } from '../candidates';
import { ChannelSender, CHANNEL_SENDERS, EmailSender, SmsSender } from './application/channel-senders';
import { DeliveryWorker } from './application/delivery-worker.service';
import { InboxService } from './application/inbox.service';
import { MessageRenderer } from './application/message-renderer.service';
import { NotificationPipeline } from './application/notification-pipeline.service';
import { Notifier } from './application/notifier.service';
import { ApplicationApprovedPlanner } from './application/planners/application-approved.planner';
import { ApplicationDeclinedPlanner } from './application/planners/application-declined.planner';
import { ApplicationSentBackPlanner } from './application/planners/application-sent-back.planner';
import { ApplicationSubmittedPlanner } from './application/planners/application-submitted.planner';
import { CandidateCreatedPlanner } from './application/planners/candidate-created.planner';
import { CeremonyCompletedPlanner } from './application/planners/ceremony-completed.planner';
import { DocumentUploadedPlanner } from './application/planners/document-uploaded.planner';
import { GuruRespondedPlanner } from './application/planners/guru-responded.planner';
import { RecipientDirectory } from './application/recipient-directory.service';
import { FilesWaitingRule } from './application/reminders/files-waiting.rule';
import { MonthlyNoteDueRule } from './application/reminders/monthly-note-due.rule';
import { MonthlyNoteLookup } from './application/reminders/monthly-note-lookup';
import { REMINDER_RULES } from './application/reminders/reminder-rule';
import { RemindersJob } from './application/reminders/reminders.job';
import { ScopedAsUser } from './application/reminders/scoped-as-user';
import { NotificationSchedulers } from './application/schedulers';
import { NotificationsController } from './http/notifications.controller';
import { AdvisoryLock } from './infrastructure/advisory-lock';
import { CandidatesMonthlyNoteLookup } from './infrastructure/candidates-monthly-note-lookup';
import { NotificationsRepository } from './infrastructure/notifications.repository';

/** One class per event type. Adding an event means adding a class here; nothing else is edited. */
const PLANNERS = [
  CandidateCreatedPlanner,
  ApplicationSubmittedPlanner,
  ApplicationSentBackPlanner,
  ApplicationApprovedPlanner,
  ApplicationDeclinedPlanner,
  GuruRespondedPlanner,
  DocumentUploadedPlanner,
  CeremonyCompletedPlanner,
];

/**
 * Tells the right people at the right moment, in their language, on the channels that work for them,
 * without ever blocking the business transaction: events become notification rows (planners, Notifier),
 * a worker sends the e-mail and SMS ones later, and a daily job adds reminders.
 */
@Module({
  imports: [CandidatesModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsRepository,
    AdvisoryLock,
    RecipientDirectory,
    Notifier,
    NotificationPipeline,
    ...PLANNERS,
    InboxService,
    MessageRenderer,
    EmailSender,
    SmsSender,
    { provide: CHANNEL_SENDERS, inject: [EmailSender, SmsSender], useFactory: (...senders: ChannelSender[]) => senders },
    DeliveryWorker,
    ScopedAsUser,
    { provide: MonthlyNoteLookup, useClass: CandidatesMonthlyNoteLookup },
    MonthlyNoteDueRule,
    FilesWaitingRule,
    { provide: REMINDER_RULES, inject: [MonthlyNoteDueRule, FilesWaitingRule], useFactory: (...rules: unknown[]) => rules },
    RemindersJob,
    NotificationSchedulers,
  ],
})
export class NotificationsModule {}
