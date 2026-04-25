export default function VoiceScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-gray-400">Voice learning</span>;
  const color = score <= 4 ? "bg-red-100 text-red-700" : score <= 7 ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700";
  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${color}`}>Voice {score}/10</span>;
}
