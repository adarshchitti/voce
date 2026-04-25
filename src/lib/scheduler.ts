import { addMinutes, setHours, setMinutes, isSameDay } from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

export function calculateScheduledAt(settings: {
  preferredTime: string;
  timezone: string;
  jitterMinutes: number;
  preferredDays: string[];
}): Date {
  const [hours, minutes] = settings.preferredTime.split(":").map(Number);
  const now = new Date();
  const zonedNow = toZonedTime(now, settings.timezone);
  const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  let candidate = zonedNow;

  for (let i = 0; i <= 7; i += 1) {
    const dayName = dayNames[candidate.getDay()];
    if (settings.preferredDays.includes(dayName)) {
      let scheduledZoned = setMinutes(setHours(candidate, hours), minutes);
      const jitter = Math.floor(Math.random() * (settings.jitterMinutes * 2 + 1)) - settings.jitterMinutes;
      scheduledZoned = addMinutes(scheduledZoned, jitter);
      if (!isSameDay(scheduledZoned, setHours(candidate, 12))) {
        scheduledZoned = setMinutes(setHours(candidate, hours), minutes);
      }
      const scheduledUtc = fromZonedTime(scheduledZoned, settings.timezone);
      if (scheduledUtc > now) return scheduledUtc;
    }
    candidate = addMinutes(candidate, 24 * 60);
    candidate = setMinutes(setHours(candidate, 0), 0);
  }

  return addMinutes(now, 24 * 60);
}
