import { db } from "@/lib/db";
import { draftQueue, rejectionReasons } from "@/lib/db/schema";
import { and, count, eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

export default async function InsightsPage() {
  const userId = await requireAuth();
  const [approved] = await db.select({ value: count() }).from(draftQueue).where(and(eq(draftQueue.userId, userId), eq(draftQueue.status, "approved")));
  const [rejected] = await db.select({ value: count() }).from(draftQueue).where(and(eq(draftQueue.userId, userId), eq(draftQueue.status, "rejected")));
  const reasons = await db.select().from(rejectionReasons).where(eq(rejectionReasons.userId, userId)).limit(5);

  const approvalRate = approved.value + rejected.value > 0 ? Math.round((approved.value / (approved.value + rejected.value)) * 100) : 0;

  return (
    <div className="space-y-3">
      <h1 className="text-lg font-semibold">Insights</h1>
      <p>Approval rate: {approvalRate}%</p>
      <p>Approved: {approved.value}</p>
      <p>Rejected: {rejected.value}</p>
      <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
        {reasons.map((r) => (
          <p key={r.id}>{r.reasonCode}: {r.freeText ?? "-"}</p>
        ))}
      </div>
    </div>
  );
}
