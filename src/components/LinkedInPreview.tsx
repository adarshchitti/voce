"use client";

import { useState } from "react";

export function LinkedInPreview({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const TRUNCATE_AT = 280;
  const shouldTruncate = text.length > TRUNCATE_AT && !expanded;

  return (
    <div className="shadow-xs rounded-lg border border-[#E5E7EB] bg-white p-4 font-[system-ui,-apple-system,sans-serif]">
      <div className="mb-3 flex items-start gap-2.5">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[#0077B5] text-[15px] font-semibold text-white">
          Y
        </div>
        <div>
          <p className="text-[13.5px] leading-tight font-semibold text-[#111827]">Your Name</p>
          <p className="mt-0.5 text-[11px] leading-tight text-[#6B7280]">Your headline · 1st</p>
          <p className="text-[11px] text-[#6B7280]">Just now · 🌐</p>
        </div>
      </div>

      <div className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-[#111827]">
        {shouldTruncate ? (
          <>
            {text.slice(0, TRUNCATE_AT)}...{" "}
            <button onClick={() => setExpanded(true)} className="font-semibold text-[#6B7280] hover:underline">
              see more
            </button>
          </>
        ) : (
          text
        )}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-[#E5E7EB] pt-3 text-[#6B7280]">
        <div className="flex items-center gap-4 text-[12px]">
          <span className="cursor-pointer hover:text-[#0077B5]">👍 Like</span>
          <span className="cursor-pointer hover:text-[#0077B5]">💬 Comment</span>
          <span className="cursor-pointer hover:text-[#0077B5]">🔁 Repost</span>
        </div>
      </div>
    </div>
  );
}
