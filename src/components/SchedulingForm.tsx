"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import { chipVariants } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const DAYS = [
  { value: "monday", label: "Mon" },
  { value: "tuesday", label: "Tue" },
  { value: "wednesday", label: "Wed" },
  { value: "thursday", label: "Thu" },
  { value: "friday", label: "Fri" },
  { value: "saturday", label: "Sat" },
  { value: "sunday", label: "Sun" },
];

const TIMEZONES = [
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage", label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HT)" },
  { value: "Europe/London", label: "London (GMT/BST)" },
  { value: "Europe/Paris", label: "Central Europe (CET)" },
  { value: "Europe/Berlin", label: "Berlin (CET)" },
  { value: "Asia/Dubai", label: "Dubai (GST)" },
  { value: "Asia/Kolkata", label: "India (IST)" },
  { value: "Asia/Singapore", label: "Singapore (SGT)" },
  { value: "Asia/Tokyo", label: "Tokyo (JST)" },
  { value: "Australia/Sydney", label: "Sydney (AEST)" },
  { value: "UTC", label: "UTC" },
];

export interface SchedulingSettings {
  cadenceMode: string;
  draftsPerDay: number;
  preferredDays: string[];
  preferredTime: string;
  timezone: string;
  jitterMinutes: number;
}

interface SchedulingFormProps {
  initialSettings: SchedulingSettings;
}

function normalizeTime(time: string) {
  return time?.slice(0, 5) ?? "09:00";
}

export function SchedulingForm({ initialSettings }: SchedulingFormProps) {
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [cadenceMode, setCadenceMode] = useState(initialSettings.cadenceMode ?? "daily");
  const [draftsPerDay, setDraftsPerDay] = useState(initialSettings.draftsPerDay ?? 3);
  const [preferredDays, setPreferredDays] = useState<string[]>(
    initialSettings.preferredDays ?? ["monday", "tuesday", "wednesday", "thursday"],
  );
  const [preferredTime, setPreferredTime] = useState(normalizeTime(initialSettings.preferredTime));
  const [timezone, setTimezone] = useState(initialSettings.timezone ?? "UTC");
  const [jitterMinutes, setJitterMinutes] = useState(initialSettings.jitterMinutes ?? 15);

  useEffect(() => {
    setCadenceMode(initialSettings.cadenceMode ?? "daily");
    setDraftsPerDay(initialSettings.draftsPerDay ?? 3);
    setPreferredDays(initialSettings.preferredDays ?? ["monday", "tuesday", "wednesday", "thursday"]);
    setPreferredTime(normalizeTime(initialSettings.preferredTime ?? "09:00"));
    setTimezone(initialSettings.timezone ?? "UTC");
    setJitterMinutes(initialSettings.jitterMinutes ?? 15);
  }, [initialSettings]);

  const toggleDay = (day: string) => {
    setPreferredDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  };

  const handleSave = async () => {
    if (preferredDays.length === 0) {
      showToast("Select at least one preferred day", "error");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cadenceMode,
          draftsPerDay,
          preferredDays,
          preferredTime: normalizeTime(preferredTime),
          timezone,
          jitterMinutes,
        }),
      });
      if (!response.ok) {
        throw new Error("Save failed");
      }
      showToast("Scheduling preferences saved");
    } catch {
      showToast("Failed to save preferences", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="eyebrow mb-2 block text-ink-2">Cadence</label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {[
            { value: "daily", label: "Daily", desc: "3 drafts each morning" },
            { value: "weekly", label: "Weekly", desc: "Batch on Saturday" },
            { value: "on_demand", label: "On demand", desc: "Trigger manually" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setCadenceMode(option.value)}
              className={cn(
                "rounded-[10px] border-2 border-ink px-3 py-2 text-left text-ink transition-colors",
                cadenceMode === option.value ? "bg-p-blue shadow-xs" : "bg-surface hover:bg-paper-sunk"
              )}
            >
              <div className="text-[13px] font-medium">{option.label}</div>
              <div className={cn("mt-0.5 text-[11px]", cadenceMode === option.value ? "text-ink-2" : "text-ink-3")}>
                {option.desc}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="eyebrow mb-2 block text-ink-2">Posting days</label>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => (
            <button
              key={day.value}
              type="button"
              onClick={() => toggleDay(day.value)}
              className={chipVariants({
                tone: preferredDays.includes(day.value) ? "blue" : "surface",
                size: "lg",
                interactive: true,
              })}
            >
              {day.label}
            </button>
          ))}
        </div>
        {preferredDays.length === 0 ? <p className="mt-1.5 text-[12px] font-medium text-destructive">Select at least one day</p> : null}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="eyebrow block text-ink-2">Preferred time</label>
          <Input
            type="time"
            value={preferredTime}
            onChange={(e) => setPreferredTime(normalizeTime(e.target.value))}
          />
        </div>
        <div className="space-y-2">
          <label className="eyebrow block text-ink-2">Timezone</label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="h-9 w-full rounded-[10px] border-2 border-ink bg-surface px-3 py-2 text-[14px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-accent-solid"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="eyebrow block text-ink-2">Drafts per day</label>
          <Input
            type="number"
            min={1}
            max={5}
            value={draftsPerDay}
            onChange={(e) => setDraftsPerDay(Math.min(5, Math.max(1, Number(e.target.value) || 1)))}
            className="w-24"
          />
        </div>

        <div className="space-y-2">
          <label className="eyebrow block text-ink-2">Posting jitter</label>
          <div className="flex flex-wrap gap-2">
            {[0, 5, 10, 15, 20, 30].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setJitterMinutes(n)}
                className={chipVariants({
                  tone: jitterMinutes === n ? "blue" : "surface",
                  size: "lg",
                  interactive: true,
                })}
              >
                {n === 0 ? "None" : `±${n}m`}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-[10px] border-2 border-ink bg-paper-sunk p-3">
        <p className="text-[12.5px] leading-relaxed text-ink-2">
          Posts will be scheduled on{" "}
          <span className="font-medium text-ink">
            {preferredDays.length > 0
              ? preferredDays.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(", ")
              : "no days selected"}
          </span>{" "}
          at <span className="font-medium text-ink">{normalizeTime(preferredTime)}</span>{" "}
          <span className="font-medium text-ink">{TIMEZONES.find((t) => t.value === timezone)?.label ?? timezone}</span>
          {jitterMinutes > 0 ? <span className="text-ink-3"> (±{jitterMinutes} min variation)</span> : null}
        </p>
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={handleSave} disabled={saving || preferredDays.length === 0}>
          {saving ? "Saving..." : "Save Scheduling"}
        </Button>
      </div>
    </div>
  );
}
