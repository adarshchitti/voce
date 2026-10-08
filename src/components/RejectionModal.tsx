"use client";

import { useState } from "react";
import { useToast } from "./Toast";
import { Button } from "@/components/ui/button";
import { chipVariants } from "@/components/ui/chip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const groupedReasons = [
  {
    title: "About the writing",
    options: [
      { code: "too_formal", label: "Too formal" },
      { code: "too_casual", label: "Too casual" },
      { code: "too_listy", label: "Too listy / structured" },
      { code: "too_long", label: "Too long" },
      { code: "too_short", label: "Too short" },
      { code: "sounds_like_ai", label: "Sounds like AI" },
      { code: "wrong_execution", label: "Good idea, wrong execution" },
      { code: "wrong_tone", label: "Wrong tone" },
    ],
  },
  {
    title: "About the topic/content",
    options: [
      { code: "wrong_topic", label: "Wrong topic" },
      { code: "not_interesting", label: "Not interesting" },
      { code: "factually_off", label: "Factually off" },
    ],
  },
  {
    title: "Other",
    options: [{ code: "other", label: "Other" }],
  },
];

export default function RejectionModal({
  draftId,
  onClose,
  onRejected,
}: {
  draftId: string;
  onClose: () => void;
  onRejected: () => void;
}) {
  const [freeText, setFreeText] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();

  async function submit() {
    if (!reasonCode) return;
    setLoading(true);
    const response = await fetch(`/api/drafts/${draftId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reasonCode, freeText: reasonCode === "other" ? freeText : undefined }),
    });
    setLoading(false);
    if (!response.ok) {
      showToast("Failed to save", "error");
      return;
    }
    showToast("Draft rejected", "success");
    onRejected();
    onClose();
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !loading) onClose();
      }}
    >
      <DialogContent showCloseButton={false} className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto p-5">
        <DialogHeader>
          <DialogTitle className="text-[17px] leading-tight font-semibold">Why reject this draft?</DialogTitle>
          <DialogDescription className="text-ink-2">Your feedback improves future drafts</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {groupedReasons.map((group) => (
            <div key={group.title} className="space-y-2">
              <p className="eyebrow text-ink-3">{group.title}</p>
              <div className="flex flex-wrap gap-2">
                {group.options.map((option) => (
                  <label
                    key={option.code}
                    className={cn(
                      chipVariants({
                        tone: reasonCode === option.code ? "coral" : "surface",
                        size: "lg",
                        interactive: !loading,
                      }),
                      "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-accent-solid",
                      loading && "cursor-not-allowed opacity-50"
                    )}
                  >
                    <input
                      type="radio"
                      name="reason"
                      value={option.code}
                      checked={reasonCode === option.code}
                      onChange={() => setReasonCode(option.code)}
                      className="sr-only"
                      disabled={loading}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>
          ))}

          <Textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder="Add detail (optional)"
            rows={2}
            className="resize-none text-[13.5px]"
            disabled={loading}
          />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading} className="flex-1">
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={!reasonCode || loading}
            className="flex-1"
          >
            {loading ? "Saving..." : "Reject draft"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
