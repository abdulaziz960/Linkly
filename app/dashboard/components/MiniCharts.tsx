"use client";

export type LineSeries = { label: string; color: string; values: number[] };

/** Dependency-free SVG line chart: one polyline per series over shared x labels. */
export function LineChart({ labels, series, height = 220 }: { labels: string[]; series: LineSeries[]; height?: number }) {
  const width = 640;
  const pad = { top: 14, right: 14, bottom: 28, left: 38 };
  const max = Math.max(1, ...series.flatMap((item) => item.values));
  const niceMax = Math.ceil(max / 4) * 4 || 4;
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const x = (index: number) => pad.left + (labels.length <= 1 ? innerW / 2 : (index / (labels.length - 1)) * innerW);
  const y = (value: number) => pad.top + innerH - (value / niceMax) * innerH;
  const step = Math.max(1, Math.ceil(labels.length / 7));
  return (
    <div className="mini-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" preserveAspectRatio="xMidYMid meet" direction="ltr">
        {[0, 1, 2, 3, 4].map((tick) => {
          const value = (niceMax / 4) * tick;
          return (
            <g key={tick}>
              <line x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} className="mini-chart-grid" />
              <text x={pad.left - 6} y={y(value) + 4} textAnchor="end" className="mini-chart-tick">{Math.round(value).toLocaleString("en-US")}</text>
            </g>
          );
        })}
        {labels.map((label, index) => index % step === 0 ? <text key={label + index} x={x(index)} y={height - 8} textAnchor="middle" className="mini-chart-tick">{label}</text> : null)}
        {series.map((item) => (
          <g key={item.label}>
            <polyline fill="none" stroke={item.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" points={item.values.map((value, index) => `${x(index)},${y(value)}`).join(" ")} />
            {item.values.map((value, index) => <circle key={index} cx={x(index)} cy={y(value)} r={3.5} fill={item.color}><title>{`${item.label} - ${labels[index]}: ${value.toLocaleString("en-US")}`}</title></circle>)}
          </g>
        ))}
      </svg>
      <div className="mini-chart-legend">
        {series.map((item) => <span key={item.label}><i style={{ background: item.color }} />{item.label}</span>)}
      </div>
    </div>
  );
}

export type DonutSlice = { label: string; value: number; color: string };

/** Dependency-free SVG donut with a total in the middle and a legend underneath. */
export function DonutChart({ slices, centerLabel }: { slices: DonutSlice[]; centerLabel: string }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="mini-donut">
      <svg viewBox="0 0 140 140" role="img" aria-label={centerLabel}>
        <circle cx={70} cy={70} r={radius} fill="none" stroke="var(--line)" strokeWidth={18} />
        {total > 0 ? slices.filter((slice) => slice.value > 0).map((slice) => {
          const length = (slice.value / total) * circumference;
          const circle = (
            <circle key={slice.label} cx={70} cy={70} r={radius} fill="none" stroke={slice.color} strokeWidth={18}
              strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)">
              <title>{`${slice.label}: ${slice.value.toLocaleString("en-US")}`}</title>
            </circle>
          );
          offset += length;
          return circle;
        }) : null}
        <text x={70} y={68} textAnchor="middle" className="mini-donut-total">{total.toLocaleString("en-US")}</text>
        <text x={70} y={86} textAnchor="middle" className="mini-chart-tick">{centerLabel}</text>
      </svg>
      <ul className="mini-donut-legend">
        {slices.map((slice) => (
          <li key={slice.label}>
            <i style={{ background: slice.color }} />
            <span>{slice.label}</span>
            <b>{slice.value.toLocaleString("en-US")}{total > 0 ? ` (${Math.round((slice.value / total) * 100)}%)` : ""}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Horizontal bars (label, value) scaled to the largest value. */
export function BarList({ items, color = "#178a82" }: { items: Array<{ label: string; value: number }>; color?: string }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <ul className="mini-bars">
      {items.map((item) => (
        <li key={item.label}>
          <span>{item.label}</span>
          <div><i style={{ width: `${(item.value / max) * 100}%`, background: color }} /></div>
          <b>{item.value.toLocaleString("en-US")}</b>
        </li>
      ))}
    </ul>
  );
}
