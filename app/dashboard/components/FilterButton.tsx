type FilterButtonProps = {
  active: boolean;
  count: number;
  label: string;
  onClick: () => void;
};

export default function FilterButton({ active, count, label, onClick }: FilterButtonProps) {
  return (
    <button className={active ? "active" : ""} type="button" onClick={onClick}>
      {label} <span>{count}</span>
    </button>
  );
}
