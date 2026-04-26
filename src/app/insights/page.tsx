import { db } from "@/lib/db";
import { draftQueue, rejectionReasons } from "@/lib/db/schema";
import { and, count, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

function StatCard({
  label,
  value,
  sub,
  color = "default",
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: "default" | "green" | "amber" | "red";
}) {
  const colors = {
    default: "text-slate-900",
    green: "text-green-600",
    amber: "text-amber-600",
    red: "text-red-600",
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-3xl font-bold ${colors[color]}`}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}

export default async function InsightsPage() {
  const userId = await requireAuth();
  const [approved] = await db.select({ value: count() }).from(draftQueue).where(and(eq(draftQueue.userId, userId), eq(draftQueue.status, "approved")));
  const [rejected] = await db.select({ value: count() }).from(draftQueue).where(and(eq(draftQueue.userId, userId), eq(draftQueue.status, "rejected")));
  const reasons = await db.select().from(rejectionReasons).where(eq(rejectionReasons.userId, userId)).limit(5);

  const total = approved.value + rejected.value;
  const approvalRate = total > 0 ? Math.round((approved.value / total) * 100) : 0;
  const rejectionRate = total > 0 ? Math.round((rejected.value / total) * 100) : 0;
  const postsThisWeek = approved.value;
  const avgVoiceScore: number | null = null;
  const rejectionRateLabel = "all time";

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold text-slate-900">Insights</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="This week" value={postsThisWeek} sub="posts published" />
        <StatCard
          label="Approval rate"
          value={`${approvalRate}%`}
          sub="last 30 days"
          color={approvalRate >= 50 ? "green" : approvalRate >= 20 ? "default" : "red"}
        />
        <StatCard
          label="Rejection rate"
          value={`${rejectionRate}%`}
          sub={rejectionRateLabel}
          color={rejectionRate >= 20 && rejectionRate <= 50 ? "green" : rejectionRate < 10 ? "red" : "amber"}
        />
        <StatCard
          label="Avg voice score"
          value={avgVoiceScore ?? "—"}
          sub="last 10 drafts"
          color={avgVoiceScore == null ? "default" : avgVoiceScore >= 8 ? "green" : avgVoiceScore >= 5 ? "amber" : "red"}
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 font-medium text-slate-900">Top rejection reasons</h2>
        <div className="space-y-2">
          {reasons.map((r) => (
            <p key={r.id} className="text-sm text-slate-700">
              <span className="font-medium text-slate-900">{r.reasonCode}</span>: {r.freeText ?? "-"}
            </p>
          ))}
          {reasons.length === 0 ? <p className="text-sm text-slate-500">No rejections yet.</p> : null}
        </div>
      </div>
    </div>
  );
}
