import LiveBadge from "./LiveBadge";

export default function PageHeader({ title, subtitle, live }: { title: string; subtitle?: string; live?: boolean }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
      <div>
        <h1 className="text-xl font-bold text-navy">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {live && <LiveBadge />}
    </div>
  );
}
