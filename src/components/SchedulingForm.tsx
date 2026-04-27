"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";

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
  const [timezone, setTimezone] = useState(initialSettings.timezone ?? "America/New_York");
  const [jitterMinutes, setJitterMinutes] = useState(initialSettings.jitterMinutes ?? 15);

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
    <div className="space-y-6">
      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">Draft generation cadence</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          {[
            { value: "daily", label: "Daily", desc: "3 drafts each morning" },
            { value: "weekly", label: "Weekly", desc: "Batch on Saturday" },
            { value: "on_demand", label: "On demand", desc: "Trigger manually" },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setCadenceMode(option.value)}
              className={`flex-1 rounded-xl border px-4 py-3 text-left transition-colors ${
                cadenceMode === option.value
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              <div className="text-sm font-medium">{option.label}</div>
              <div className={`mt-0.5 text-xs ${cadenceMode === option.value ? "text-blue-500" : "text-slate-400"}`}>
                {option.desc}
              </div>
            </button>
          ))}
        </div>
      </div>

      {cadenceMode === "daily" ? (
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">
            Drafts per day
            <span className="ml-1 text-xs font-normal text-slate-400">- how many drafts to generate each morning</span>
          </label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setDraftsPerDay(n)}
                className={`h-10 w-10 rounded-lg border text-sm font-medium transition-colors ${
                  draftsPerDay === n
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <label className="mb-2 block text-sm font-medium text-slate-700">
          Preferred posting days
          <span className="ml-1 text-xs font-normal text-slate-400">- approved posts schedule on these days</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => (
            <button
              key={day.value}
              type="button"
              onClick={() => toggleDay(day.value)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                preferredDays.includes(day.value)
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              {day.label}
            </button>
          ))}
        </div>
        {preferredDays.length === 0 ? <p className="mt-1 text-xs text-red-500">Select at least one day</p> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Preferred posting time</label>
          <input
            type="time"
            value={preferredTime}
            onChange={(e) => setPreferredTime(normalizeTime(e.target.value))}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Timezone</label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-slate-700">
          Posting time variation
          <span className="ml-1 text-xs font-normal text-slate-400">
            - randomises post time by ±{jitterMinutes} minutes to avoid robotic patterns
          </span>
        </label>
        <div className="flex gap-2">
          {[0, 5, 10, 15, 20, 30].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setJitterMinutes(n)}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                jitterMinutes === n
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              {n === 0 ? "None" : `±${n}m`}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs text-slate-500">
          Posts will be scheduled on{" "}
          <span className="font-medium text-slate-700">
            {preferredDays.length > 0
              ? preferredDays.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(", ")
              : "no days selected"}
          </span>{" "}
          at <span className="font-medium text-slate-700">{normalizeTime(preferredTime)}</span>{" "}
          <span className="font-medium text-slate-700">{TIMEZONES.find((t) => t.value === timezone)?.label ?? timezone}</span>
          {jitterMinutes > 0 ? <span className="text-slate-400"> (±{jitterMinutes} min variation)</span> : null}
        </p>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || preferredDays.length === 0}
          className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-medium text-white transition-colors duration-150 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save scheduling preferences"}
        </button>
      </div>
    </div>
  );
}
