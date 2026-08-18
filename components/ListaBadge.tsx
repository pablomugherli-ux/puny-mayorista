export default function ListaBadge({ lista }: { lista: number }) {
  return (
    <span
      className={`badge ${
        lista === 1 ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"
      }`}
    >
      Lista {lista}
    </span>
  );
}
