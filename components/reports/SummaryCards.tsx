import { Card, CardContent } from "@/components/ui/Card";
import { formatHm } from "@/lib/utils/format";

interface SummaryCardsProps {
  totalUsers?: number;
  clockedIn?: number;
  completed?: number;
  incomplete?: number;
  totalSeconds?: number;
}

export function SummaryCards({
  totalUsers,
  clockedIn,
  completed,
  incomplete,
  totalSeconds,
}: SummaryCardsProps) {
  const cards: Array<{ label: string; value: string }> = [];
  if (typeof totalUsers === "number") cards.push({ label: "Total users", value: String(totalUsers) });
  if (typeof clockedIn === "number") cards.push({ label: "Clocked in", value: String(clockedIn) });
  if (typeof completed === "number") cards.push({ label: "Completed", value: String(completed) });
  if (typeof incomplete === "number") cards.push({ label: "Incomplete", value: String(incomplete) });
  if (typeof totalSeconds === "number") cards.push({ label: "Total time", value: formatHm(totalSeconds) });

  if (cards.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent>
            <p className="text-sm text-slate-500">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{c.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default SummaryCards;
