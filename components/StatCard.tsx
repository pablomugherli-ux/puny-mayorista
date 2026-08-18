import AnimatedNumber from "./AnimatedNumber";

export default function StatCard({
  label, value, sub, tech = false, numericValue, format,
}: {
  label: string; value: string; sub?: string; tech?: boolean;
  numericValue?: number; format?: (n: number) => string;
}) {
  return (
    <div className={tech ? "card-tech animate-in" : "card animate-in"}>
      <div className={`text-xs uppercase tracking-wide ${tech ? "text-white/70" : "text-gray-500"}`}>{label}</div>
      <div className={`text-2xl font-bold mt-1 ${tech ? "text-white" : "text-navy"}`}>
        {numericValue != null ? <AnimatedNumber value={numericValue} format={format} /> : value}
      </div>
      {sub && <div className={`text-xs mt-1 ${tech ? "text-white/50" : "text-gray-400"}`}>{sub}</div>}
    </div>
  );
}
