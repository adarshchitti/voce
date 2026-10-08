"use client";

import { useState } from "react";

// A preview of someone else's UI: kept recognisably LinkedIn on purpose.
// White card, thin neutral border, system font and LinkedIn's own blue
// for the avatar and action hover. Greys map onto the ink tokens;
// the 2px ink border / hard shadow register is deliberately NOT applied here.
export function LinkedInPreview({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const TRUNCATE_AT = 280;
  const shouldTruncate = text.length > TRUNCATE_AT && !expanded;

  return (
    <div className="rounded-lg border border-hairline bg-surface p-4 font-[system-ui,-apple-system,sans-serif]">
      <div className="mb-3 flex items-start gap-2.5">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-linkedin text-[15px] font-semibold text-white">
          Y
        </div>
        <div>
          <p className="text-[13.5px] leading-tight font-semibold text-ink">Your Name</p>
          <p className="mt-0.5 text-[11px] leading-tight text-ink-2">Your headline · 1st</p>
          <p className="text-[11px] text-ink-2">Just now · 🌐</p>
        </div>
      </div>

      <div className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink">
        {shouldTruncate ? (
          <>
            {text.slice(0, TRUNCATE_AT)}...{" "}
            <button onClick={() => setExpanded(true)} className="font-semibold text-ink-2 hover:underline">
              see more
            </button>
          </>
        ) : (
          text
        )}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-hairline pt-3 text-ink-2">
        <div className="flex items-center gap-4 text-[12px]">
          <span className="cursor-pointer hover:text-linkedin">👍 Like</span>
          <span className="cursor-pointer hover:text-linkedin">💬 Comment</span>
          <span className="cursor-pointer hover:text-linkedin">🔁 Repost</span>
        </div>
      </div>
    </div>
  );
}
