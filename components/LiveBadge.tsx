export default function LiveBadge({ label = "En vivo" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-electric bg-navy px-2 py-1 rounded-full">
      <span className="live-dot" /> {label}
    </span>
  );
}
