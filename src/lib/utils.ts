import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function combineDateAndTime(
  date: string,
  time: string,
  timezone: string,
): string {
  const dateTimeStr = `${date}T${time}:00`;
  void timezone;
  return new Date(dateTimeStr).toISOString();
}
