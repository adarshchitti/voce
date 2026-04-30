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
    <div className="space-y-5">
      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-[#374151]">Cadence</label>
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
              className={`rounded-md border px-3 py-2 text-left transition-colors ${
                cadenceMode === option.value
                  ? "border-[#BFDBFE] bg-[#EFF6FF] text-[#2563EB]"
                  : "border-[#E5E7EB] bg-white text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#111827]"
              }`}
            >
              <div className="text-[13px] font-medium">{option.label}</div>
              <div className={`mt-0.5 text-[11px] ${cadenceMode === option.value ? "text-[#2563EB]" : "text-[#9CA3AF]"}`}>
                {option.desc}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-[13px] font-medium text-[#374151]">Posting days</label>
        <div className="flex flex-wrap gap-2">
          {DAYS.map((day) => (
            <button
              key={day.value}
              type="button"
              onClick={() => toggleDay(day.value)}
              className={`h-8 rounded-full border px-3 text-[12px] font-medium transition-colors ${
                preferredDays.includes(day.value)
                  ? "border-[#BFDBFE] bg-[#EFF6FF] text-[#2563EB]"
                  : "border-[#E5E7EB] bg-white text-[#6B7280] hover:border-[#2563EB]"
              }`}
            >
              {day.label}
            </button>
          ))}
        </div>
        {preferredDays.length === 0 ? <p className="mt-1 text-[11px] text-[#DC2626]">Select at least one day</p> : null}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="block text-[13px] font-medium text-[#374151]">Preferred time</label>
          <input
            type="time"
            value={preferredTime}
            onChange={(e) => setPreferredTime(normalizeTime(e.target.value))}
            className="h-9 w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-[13.5px] text-[#111827] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-[13px] font-medium text-[#374151]">Timezone</label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="h-9 w-full rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-[13.5px] text-[#111827] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
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
        <div className="space-y-1.5">
          <label className="block text-[13px] font-medium text-[#374151]">Drafts per day</label>
          <input
            type="number"
            min={1}
            max={5}
            value={draftsPerDay}
            onChange={(e) => setDraftsPerDay(Math.min(5, Math.max(1, Number(e.target.value) || 1)))}
            className="h-9 w-24 rounded-md border border-[#E5E7EB] bg-white px-3 py-2 text-[13.5px] text-[#111827] focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/20"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-[13px] font-medium text-[#374151]">Posting jitter</label>
          <div className="flex flex-wrap gap-2">
          {[0, 5, 10, 15, 20, 30].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setJitterMinutes(n)}
              className={`h-8 rounded-full border px-3 text-[12px] font-medium transition-colors ${
                jitterMinutes === n
                  ? "border-[#BFDBFE] bg-[#EFF6FF] text-[#2563EB]"
                  : "border-[#E5E7EB] bg-white text-[#6B7280] hover:border-[#2563EB]"
              }`}
            >
              {n === 0 ? "None" : `±${n}m`}
            </button>
          ))}
          </div>
        </div>
      </div>

      <div className="rounded-md border border-[#E5E7EB] bg-[#F9FAFB] p-3">
        <p className="text-[12px] text-[#6B7280]">
          Posts will be scheduled on{" "}
          <span className="font-medium text-[#111827]">
            {preferredDays.length > 0
              ? preferredDays.map((d) => d.charAt(0).toUpperCase() + d.slice(1)).join(", ")
              : "no days selected"}
          </span>{" "}
          at <span className="font-medium text-[#111827]">{normalizeTime(preferredTime)}</span>{" "}
          <span className="font-medium text-[#111827]">{TIMEZONES.find((t) => t.value === timezone)?.label ?? timezone}</span>
          {jitterMinutes > 0 ? <span className="text-[#9CA3AF]"> (±{jitterMinutes} min variation)</span> : null}
        </p>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || preferredDays.length === 0}
          className="flex h-8 items-center gap-1.5 rounded-md bg-[#2563EB] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Scheduling"}
        </button>
      </div>
    </div>
  );
}
