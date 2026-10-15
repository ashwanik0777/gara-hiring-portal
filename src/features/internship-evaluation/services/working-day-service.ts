import { WorkingDayCalendarConfig } from "../types";

/**
 * Baseline default working calendar (Standard Monday - Friday, no assumed holidays).
 * Concrete national/company holiday lists are supplied via explicit calendar configuration (OD-002).
 */
export const DEFAULT_WORKING_CALENDAR: WorkingDayCalendarConfig = {
  workingDaysOfWeek: [1, 2, 3, 4, 5], // Monday through Friday
  holidays: [],
};

export class WorkingDayService {
  /**
   * Formats a Date to YYYY-MM-DD for holiday calendar lookups.
   */
  private formatDateKey(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /**
   * Evaluates if a given date is a working day under the specified calendar.
   */
  isWorkingDay(date: Date, calendar: WorkingDayCalendarConfig = DEFAULT_WORKING_CALENDAR): boolean {
    const dayOfWeek = date.getUTCDay();

    // 1. Check if day of week is configured as a working day
    if (!calendar.workingDaysOfWeek.includes(dayOfWeek)) {
      return false;
    }

    // 2. Check if date matches any configured holiday
    const dateKey = this.formatDateKey(date);
    if (calendar.holidays.includes(dateKey)) {
      return false;
    }

    return true;
  }

  /**
   * Calculates the end date after adding a target number of working days.
   * If targetDays is 7, and day 1 is startDate (if working day), it advances until
   * 7 working days have been completed.
   */
  addWorkingDays(
    startDate: Date,
    targetDays: number,
    calendar: WorkingDayCalendarConfig = DEFAULT_WORKING_CALENDAR
  ): Date {
    if (targetDays <= 0) return new Date(startDate);

    const current = new Date(startDate);
    let workingDaysCounted = 0;

    // If start date itself is a working day, count it as Day 1
    if (this.isWorkingDay(current, calendar)) {
      workingDaysCounted = 1;
    }

    while (workingDaysCounted < targetDays) {
      current.setUTCDate(current.getUTCDate() + 1);
      if (this.isWorkingDay(current, calendar)) {
        workingDaysCounted += 1;
      }
    }

    return current;
  }

  /**
   * Counts the number of working days between two dates (inclusive).
   */
  countWorkingDays(
    startDate: Date,
    endDate: Date,
    calendar: WorkingDayCalendarConfig = DEFAULT_WORKING_CALENDAR
  ): number {
    if (startDate > endDate) return 0;

    let count = 0;
    const current = new Date(startDate);

    while (current <= endDate) {
      if (this.isWorkingDay(current, calendar)) {
        count += 1;
      }
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return count;
  }

  /**
   * Generates dates for all working checkpoints in the evaluation period.
   */
  getDailyCheckpointsSchedule(
    startDate: Date,
    totalWorkingDays: number,
    calendar: WorkingDayCalendarConfig = DEFAULT_WORKING_CALENDAR
  ): Date[] {
    const dates: Date[] = [];
    const current = new Date(startDate);

    while (dates.length < totalWorkingDays) {
      if (this.isWorkingDay(current, calendar)) {
        dates.push(new Date(current));
      }
      current.setUTCDate(current.getUTCDate() + 1);
    }

    return dates;
  }
}

export const workingDayService = new WorkingDayService();
