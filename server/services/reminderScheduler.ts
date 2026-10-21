/**
 * Dero Vault — Backup Reminder Scheduler
 * 
 * Objective: Reliable, user-configurable Backup Reminder service.
 * - Authoritative background scheduler (lives in persistent server process).
 * - Distinguishes Reminders (advisory alerts) from Scheduled Backups (never automated without consent).
 * - Tracks last successful verified backup as the single source of truth.
 * - Intelligent suppression: skips reminders if work is already verified, active backup running,
 *   snooze deadline active, or dismissed for the current cycle.
 * - Defers reminders if backup running, suppressing on success or notifying on failure.
 * - Detects system sleep/wake and clock jumps to avoid duplicate notification spam.
 */

import { LocalDatabase } from './localDb.js';
import { BackupEngine } from './backupEngine.js';
import {
  BackupReminderSettings,
  BackupSession,
  ReminderFrequency,
  ReminderNotificationData,
  ReminderStatus,
} from '../types.js';

export interface ReminderSchedulerOptions {
  checkIntervalMs?: number; // default 30,000ms (30s)
  broadcast?: (eventType: string, data: any) => void;
}

export class ReminderScheduler {
  private db: LocalDatabase;
  private backupEngine: BackupEngine;
  private broadcast: (eventType: string, data: any) => void;

  private checkIntervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private lastCheckTime: number = Date.now();

  // In-memory active notification (if any) and deferred flag
  private activeNotification: ReminderNotificationData | null = null;
  private pendingDeferredReminder: boolean = false;
  private deferredOccurrenceId: string | null = null;

  // Debounce for notification delivery
  private lastNotificationTimestamp: number = 0;

  constructor(
    db: LocalDatabase,
    backupEngine: BackupEngine,
    options?: ReminderSchedulerOptions
  ) {
    this.db = db;
    this.backupEngine = backupEngine;
    this.checkIntervalMs = options?.checkIntervalMs || 30000;
    this.broadcast = options?.broadcast || (() => {});

    // Hook into backup lifecycle for intelligent suppression and deferral
    this.backupEngine.on('session:start', () => {
      this.handleBackupStarted();
    });

    this.backupEngine.on('session:complete', (session: BackupSession) => {
      this.handleBackupCompleted(session);
    });
  }

  public start(): void {
    if (this.timer) return;
    this.lastCheckTime = Date.now();
    this.evaluateReminderState('startup');

    this.timer = setInterval(() => {
      const now = Date.now();
      const elapsed = now - this.lastCheckTime;
      this.lastCheckTime = now;

      // Handle clock jumps (e.g. sleep/wake or timezone shift)
      if (elapsed > this.checkIntervalMs * 4) {
        this.db.log(
          'info',
          'ReminderScheduler',
          `System clock jump / wake detected (${Math.round(elapsed / 1000)}s gap). Re-evaluating schedule.`
        );
      }

      this.evaluateReminderState('interval_tick');
    }, this.checkIntervalMs);

    this.db.log('info', 'ReminderScheduler', 'Backup reminder background scheduler started.');
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Returns authoritative reminder status including next schedule,
   * last verified backup, suppression reasons, and active notification.
   */
  public getStatus(): ReminderStatus {
    const settings = this.db.getReminderSettings();
    const lastSession = this.db.getLastSuccessfulVerifiedBackup();
    const lastVerifiedBackupAt = lastSession?.endTime || null;

    if (!settings.enabled) {
      return {
        settings,
        nextReminderAt: null,
        lastVerifiedBackupAt,
        isSuppressed: true,
        suppressionReason: 'Backup reminders are currently disabled.',
        isDue: false,
        activeReminderNotification: null,
      };
    }

    const now = new Date();
    const { nextDate, currentOccurrenceId, isDueNow, cycleStart } = this.calculateOccurrence(settings, now);

    // Check suppression reasons in priority order
    let isSuppressed = false;
    let suppressionReason: string | undefined;

    // 1. Actively running backup
    if (this.backupEngine.isRunning()) {
      isSuppressed = true;
      suppressionReason = 'Backup actively in progress.';
    }
    // 2. Snooze active
    else if (settings.snoozeUntil && new Date(settings.snoozeUntil).getTime() > now.getTime()) {
      isSuppressed = true;
      const snoozeTime = new Date(settings.snoozeUntil).getTime();
      const remainingMinutes = Math.max(1, Math.round((snoozeTime - now.getTime()) / 60000));
      suppressionReason = `Snoozed until ${new Date(settings.snoozeUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${remainingMinutes}m remaining).`;
    }
    // 3. Successful verified backup already performed in current cycle
    else if (lastVerifiedBackupAt && new Date(lastVerifiedBackupAt) >= cycleStart) {
      isSuppressed = true;
      const lastBackupDate = new Date(lastVerifiedBackupAt);
      const backupTimeStr = lastBackupDate.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      suppressionReason = `Work already verified and secured for this cycle (${backupTimeStr}).`;
    }
    // 4. Already dismissed for this cycle
    else if (settings.lastDismissedOccurrenceId === currentOccurrenceId) {
      isSuppressed = true;
      suppressionReason = 'Notification dismissed for the current reminder cycle.';
    }

    return {
      settings,
      nextReminderAt: nextDate ? nextDate.toISOString() : null,
      lastVerifiedBackupAt,
      isSuppressed,
      suppressionReason,
      isDue: isDueNow && !isSuppressed,
      activeReminderNotification: this.activeNotification,
    };
  }

  /**
   * Update user settings and immediately re-evaluate schedule.
   */
  public updateSettings(partial: Partial<BackupReminderSettings>): ReminderStatus {
    const updated = this.db.updateReminderSettings(partial);

    // If disabled or user changed schedule, clear active notification
    if (!updated.enabled) {
      this.activeNotification = null;
      this.pendingDeferredReminder = false;
    }

    const status = this.getStatus();
    this.broadcast('reminder:status', status);
    return status;
  }

  /**
   * Snooze the reminder by X minutes or to an explicit deadline.
   */
  public snooze(minutes: number = 60): ReminderStatus {
    const snoozeUntil = new Date(Date.now() + minutes * 60000).toISOString();
    this.db.updateReminderSettings({ snoozeUntil });
    this.activeNotification = null;
    this.pendingDeferredReminder = false;

    this.db.log('info', 'ReminderScheduler', `Reminder snoozed for ${minutes} minutes until ${snoozeUntil}`);

    const status = this.getStatus();
    this.broadcast('reminder:snoozed', { snoozeUntil, minutes, status });
    this.broadcast('reminder:status', status);
    return status;
  }

  /**
   * Clear active snooze manually.
   */
  public clearSnooze(): ReminderStatus {
    this.db.updateReminderSettings({ snoozeUntil: null });
    this.db.log('info', 'ReminderScheduler', 'Reminder snooze cleared by user.');
    const status = this.getStatus();
    this.broadcast('reminder:status', status);
    return status;
  }

  /**
   * Dismiss the notification for this specific occurrence without disabling reminders.
   */
  public dismiss(): ReminderStatus {
    const settings = this.db.getReminderSettings();
    const now = new Date();
    const { currentOccurrenceId } = this.calculateOccurrence(settings, now);

    this.db.updateReminderSettings({
      lastDismissedOccurrenceId: currentOccurrenceId,
      snoozeUntil: null,
    });

    this.activeNotification = null;
    this.pendingDeferredReminder = false;

    this.db.log(
      'info',
      'ReminderScheduler',
      `Dismissed reminder occurrence ${currentOccurrenceId}. Future scheduled reminders remain enabled.`
    );

    const status = this.getStatus();
    this.broadcast('reminder:dismissed', { occurrenceId: currentOccurrenceId, status });
    this.broadcast('reminder:status', status);
    return status;
  }

  /**
   * Trigger an immediate test reminder to allow users to verify desktop toast and UI.
   */
  public triggerTestReminder(): ReminderStatus {
    const lastSession = this.db.getLastSuccessfulVerifiedBackup();
    const lastVerifiedBackupAt = lastSession?.endTime || null;

    const testNotification: ReminderNotificationData = {
      id: `rem_test_${Date.now()}`,
      occurrenceId: `test_${Date.now()}`,
      message: lastVerifiedBackupAt
        ? `Time to back up your work to your digital granary. Last verified backup: ${new Date(lastVerifiedBackupAt).toLocaleString()}`
        : "Time to back up your work to your digital granary. No successful backup recorded yet.",
      lastVerifiedBackupAt,
      scheduledTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      triggeredAt: new Date().toISOString(),
    };

    this.activeNotification = testNotification;
    this.broadcast('reminder:due', testNotification);

    const status = this.getStatus();
    this.broadcast('reminder:status', status);
    return status;
  }

  /**
   * Called when BackupEngine starts a backup.
   * Defers reminder if it was active or due.
   */
  private handleBackupStarted(): void {
    if (this.activeNotification) {
      this.pendingDeferredReminder = true;
      this.deferredOccurrenceId = this.activeNotification.occurrenceId;
      this.activeNotification = null; // hide while running
      this.db.log('info', 'ReminderScheduler', 'Backup started; deferring active reminder until backup finishes.');
    }
  }

  /**
   * Called when BackupEngine completes a backup.
   * If verified success: suppresses reminder for this cycle.
   * If failed/interrupted: re-surfaces deferred reminder if needed.
   */
  private handleBackupCompleted(session: BackupSession): void {
    const isSuccessVerified = session.status === 'completed' && session.isVerified === true;

    if (isSuccessVerified) {
      // Work is safely verified and secured!
      this.pendingDeferredReminder = false;
      this.deferredOccurrenceId = null;
      this.activeNotification = null;

      const settings = this.db.getReminderSettings();
      const now = new Date();
      const { currentOccurrenceId } = this.calculateOccurrence(settings, now);

      // Mark this occurrence as satisfied so user is not prompted again this cycle
      this.db.updateReminderSettings({
        lastNotifiedOccurrenceId: currentOccurrenceId,
        snoozeUntil: null,
      });

      this.db.log(
        'success',
        'ReminderScheduler',
        `Verified backup completed. Suppressing reminders for cycle ${currentOccurrenceId}.`
      );
    } else if (this.pendingDeferredReminder) {
      // Backup failed or had errors and reminder was deferred
      this.pendingDeferredReminder = false;
      const lastSession = this.db.getLastSuccessfulVerifiedBackup();
      const lastVerifiedBackupAt = lastSession?.endTime || null;

      const notif: ReminderNotificationData = {
        id: `rem_deferred_${Date.now()}`,
        occurrenceId: this.deferredOccurrenceId || `def_${Date.now()}`,
        message: `Your backup was interrupted or completed with warnings. Please connect your vault drive to secure your files.`,
        lastVerifiedBackupAt,
        scheduledTime: 'Immediate',
        triggeredAt: new Date().toISOString(),
      };

      this.activeNotification = notif;
      this.broadcast('reminder:due', notif);
      this.db.log('warn', 'ReminderScheduler', 'Backup did not complete cleanly; delivering deferred reminder alert.');
    }

    const status = this.getStatus();
    this.broadcast('reminder:status', status);
  }

  /**
   * Authoritative evaluation of reminder state.
   */
  private evaluateReminderState(source: string): void {
    const settings = this.db.getReminderSettings();
    if (!settings.enabled) {
      return;
    }

    // Do not alert while backup is actively running
    if (this.backupEngine.isRunning()) {
      return;
    }

    const now = new Date();
    const { nextDate, currentOccurrenceId, isDueNow, cycleStart } = this.calculateOccurrence(settings, now);

    // Check if snoozed
    if (settings.snoozeUntil) {
      const snoozeTime = new Date(settings.snoozeUntil).getTime();
      if (snoozeTime > now.getTime()) {
        return; // still within snooze window
      }
      // Snooze expired: clear it
      this.db.updateReminderSettings({ snoozeUntil: null });
    }

    // Check if dismissed for this cycle
    if (settings.lastDismissedOccurrenceId === currentOccurrenceId) {
      return;
    }

    // Check if verified backup completed during this cycle
    const lastSession = this.db.getLastSuccessfulVerifiedBackup();
    const lastVerifiedBackupAt = lastSession?.endTime || null;
    if (lastVerifiedBackupAt) {
      const backupTime = new Date(lastVerifiedBackupAt).getTime();
      if (backupTime >= cycleStart.getTime()) {
        // Already backed up in this cycle: suppress
        return;
      }
    }

    // Check if already notified for this exact occurrence
    if (settings.lastNotifiedOccurrenceId === currentOccurrenceId && !settings.snoozeUntil) {
      return;
    }

    // Prevent duplicate fires within 60s
    if (Date.now() - this.lastNotificationTimestamp < 60000) {
      return;
    }

    if (isDueNow) {
      this.lastNotificationTimestamp = Date.now();
      this.db.updateReminderSettings({
        lastNotifiedOccurrenceId: currentOccurrenceId,
      });

      const message = lastVerifiedBackupAt
        ? `It's time to plug in your vault drive and protect your work. Last verified backup: ${new Date(lastVerifiedBackupAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}.`
        : `It's time to plug in your vault drive and protect your work. No successful backup recorded yet.`;

      const notification: ReminderNotificationData = {
        id: `rem_${Date.now()}`,
        occurrenceId: currentOccurrenceId,
        message,
        lastVerifiedBackupAt,
        scheduledTime: settings.time,
        triggeredAt: new Date().toISOString(),
      };

      this.activeNotification = notification;
      this.db.log(
        'info',
        'ReminderScheduler',
        `Backup reminder fired for occurrence ${currentOccurrenceId} (eval source: ${source})`
      );

      this.broadcast('reminder:due', notification);
      this.broadcast('reminder:status', this.getStatus());
    }
  }

  /**
   * Calculates the occurrence details for the given settings and date.
   */
  public calculateOccurrence(
    settings: BackupReminderSettings,
    now: Date
  ): {
    nextDate: Date | null;
    currentOccurrenceId: string;
    isDueNow: boolean;
    cycleStart: Date;
  } {
    const [hoursStr, minutesStr] = settings.time.split(':');
    const targetHours = parseInt(hoursStr || '17', 10);
    const targetMinutes = parseInt(minutesStr || '0', 10);

    const year = now.getFullYear();
    const month = now.getMonth();
    const date = now.getDate();
    const dayOfWeek = now.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat

    let nextDate: Date = new Date(year, month, date, targetHours, targetMinutes, 0, 0);
    let currentOccurrenceId = '';
    let isDueNow = false;
    let cycleStart = new Date(year, month, date, 0, 0, 0, 0);

    switch (settings.frequency) {
      case 'daily': {
        const todayScheduled = new Date(year, month, date, targetHours, targetMinutes, 0, 0);
        currentOccurrenceId = `daily_${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
        cycleStart = new Date(year, month, date, 0, 0, 0, 0);

        if (now.getTime() >= todayScheduled.getTime()) {
          isDueNow = true;
          // Next is tomorrow
          nextDate = new Date(year, month, date + 1, targetHours, targetMinutes, 0, 0);
        } else {
          isDueNow = false;
          nextDate = todayScheduled;
        }
        break;
      }

      case 'weekly': {
        // weeklyDays: array of numbers [0..6] (e.g. [5] for Friday)
        const allowedDays = settings.weeklyDays && settings.weeklyDays.length > 0
          ? settings.weeklyDays
          : [5]; // default Friday

        const isTodayTargetDay = allowedDays.includes(dayOfWeek);
        const todayScheduled = new Date(year, month, date, targetHours, targetMinutes, 0, 0);

        // Current cycle start: start of the current week (Sunday)
        cycleStart = new Date(year, month, date - dayOfWeek, 0, 0, 0, 0);
        currentOccurrenceId = `weekly_${year}_W${this.getWeekNumber(now)}_${dayOfWeek}`;

        if (isTodayTargetDay && now.getTime() >= todayScheduled.getTime()) {
          isDueNow = true;
        }

        // Find the next upcoming scheduled date
        let foundNext: Date | null = null;
        for (let offset = 0; offset <= 7; offset++) {
          const testDate = new Date(year, month, date + offset, targetHours, targetMinutes, 0, 0);
          const testDay = testDate.getDay();
          if (allowedDays.includes(testDay)) {
            if (testDate.getTime() > now.getTime()) {
              foundNext = testDate;
              break;
            }
          }
        }
        nextDate = foundNext || new Date(year, month, date + 7, targetHours, targetMinutes, 0, 0);
        break;
      }

      case 'monthly': {
        // Date selection: 1 - 31, with sensible clamping for months with fewer days
        const targetDaySetting = Math.max(1, Math.min(31, settings.monthlyDay || 1));
        const daysInCurrentMonth = new Date(year, month + 1, 0).getDate();
        const clampedDayThisMonth = Math.min(targetDaySetting, daysInCurrentMonth);

        const thisMonthScheduled = new Date(year, month, clampedDayThisMonth, targetHours, targetMinutes, 0, 0);
        cycleStart = new Date(year, month, 1, 0, 0, 0, 0);
        currentOccurrenceId = `monthly_${year}-${String(month + 1).padStart(2, '0')}`;

        if (date === clampedDayThisMonth && now.getTime() >= thisMonthScheduled.getTime()) {
          isDueNow = true;
        }

        if (now.getTime() < thisMonthScheduled.getTime()) {
          nextDate = thisMonthScheduled;
        } else {
          // Next month
          const nextMonthIndex = month + 1;
          const daysInNextMonth = new Date(year, nextMonthIndex + 1, 0).getDate();
          const clampedDayNextMonth = Math.min(targetDaySetting, daysInNextMonth);
          nextDate = new Date(year, nextMonthIndex, clampedDayNextMonth, targetHours, targetMinutes, 0, 0);
        }
        break;
      }
    }

    return { nextDate, currentOccurrenceId, isDueNow, cycleStart };
  }

  private getWeekNumber(d: Date): number {
    const target = new Date(d.valueOf());
    const dayNr = (d.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
      target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
    }
    return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  }
}
