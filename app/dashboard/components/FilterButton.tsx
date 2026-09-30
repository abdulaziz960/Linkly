type FilterButtonProps = {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
  tone?: "danger";
};

export default function FilterButton({ active, count, label, onClick, tone }: FilterButtonProps) {
  const className = [active ? "active" : "", tone ? `tone-${tone}` : ""].filter(Boolean).join(" ");
  return (
    <button className={className} type="button" role="tab" aria-selected={active} onClick={onClick}>
      {label} <span>{count}</span>
    </button>
  );
}
