"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

// Dependency-free SVG charts. Time flows right-to-left (Arabic reading order);
// every chart ships a visually hidden data table so it is readable by screen readers.

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export const CHART_COLORS = ["var(--ds-chart-1)", "var(--ds-chart-2)", "var(--ds-chart-3)", "var(--ds-chart-4)", "var(--ds-chart-5)"];

export type Series = { name: string; color: string; values: (number | null)[]; dashed?: boolean };

function niceMax(value: number) {
  if (value <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const n = value / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function ChartTable({ caption, labels, series, format }: { caption: string; labels: string[]; series: Series[]; format: (value: number) => string }) {
  return (
    <table className="ds-sr-only">
      <caption>{caption}</caption>
      <thead><tr><th>الفترة</th>{series.map((item) => <th key={item.name}>{item.name}</th>)}</tr></thead>
      <tbody>{labels.map((label, index) => <tr key={label + index}><th>{label}</th>{series.map((item) => <td key={item.name}>{item.values[index] == null ? "—" : format(item.values[index] as number)}</td>)}</tr>)}</tbody>
    </table>
  );
}

export function LineChart({ labels, series, format, caption, height = 260, area = true, empty }: {
  labels: string[];
  series: Series[];
  format: (value: number) => string;
  caption: string;
  height?: number;
  area?: boolean;
  empty?: ReactNode;
}) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gradientId = useId();
  const hasData = labels.length > 1 && series.some((item) => item.values.some((value) => (value ?? 0) > 0));
  if (!hasData) return <div className="ds-chart-empty" style={{ minHeight: height }}>{empty}</div>;

  const padding = { top: 14, right: 12, bottom: 28, left: 46 };
  const innerW = Math.max(40, width - padding.left - padding.right);
  const innerH = height - padding.top - padding.bottom;
  const max = niceMax(Math.max(...series.flatMap((item) => item.values.map((value) => value ?? 0))));
  const count = labels.length;
  // Index 0 (oldest) is drawn at the right edge for RTL.
  const x = (index: number) => padding.left + innerW - (index / (count - 1)) * innerW;
  const y = (value: number) => padding.top + innerH - (value / max) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => fraction * max);
  const labelEvery = Math.max(1, Math.ceil(count / Math.max(2, Math.floor(innerW / 64))));

  const onMove = (clientX: number, rect: DOMRect) => {
    const ratio = Math.min(1, Math.max(0, (rect.right - clientX) / rect.width));
    setHover(Math.round(ratio * (count - 1)));
  };

  return (
    <div className="ds-chart" ref={wrapRef} style={{ height }}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={caption} onPointerLeave={() => setHover(null)}>
          <defs>
            {series.map((item, index) => (
              <linearGradient key={item.name} id={`${gradientId}-${index}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={item.color} stopOpacity="0.22" />
                <stop offset="100%" stopColor={item.color} stopOpacity="0" />
              </linearGradient>
            ))}
          </defs>
          {ticks.map((tick) => (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y(tick)} y2={y(tick)} className="ds-chart-grid" />
              <text x={padding.left - 8} y={y(tick) + 4} textAnchor="end" className="ds-chart-axis">{format(tick)}</text>
            </g>
          ))}
          {labels.map((label, index) => (index % labelEvery === 0 || index === count - 1) ? (
            <text key={label + index} x={x(index)} y={height - 8} textAnchor="middle" className="ds-chart-axis">{label}</text>
          ) : null)}
          {series.map((item, seriesIndex) => {
            // Null values break the line into separate segments (e.g. collected
            // revenue stops at "now" while the expected line continues).
            const segments: string[][] = [];
            let current: string[] = [];
            item.values.forEach((value, index) => {
              if (value == null) {
                if (current.length) segments.push(current);
                current = [];
              } else {
                current.push(`${x(index).toFixed(1)},${y(value).toFixed(1)}`);
              }
            });
            if (current.length) segments.push(current);
            return (
              <g key={item.name}>
                {segments.map((points, segmentIndex) => {
                  const line = `M${points.join(" L")}`;
                  const first = points[0].split(",")[0];
                  const last = points[points.length - 1].split(",")[0];
                  return (
                    <g key={segmentIndex}>
                      {area && seriesIndex === 0 && points.length > 1 ? <path d={`${line} L${last},${y(0)} L${first},${y(0)} Z`} fill={`url(#${gradientId}-${seriesIndex})`} /> : null}
                      <path d={line} fill="none" stroke={item.color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray={item.dashed ? "6 5" : undefined} />
                      {points.length === 1 ? <circle cx={Number(first)} cy={Number(points[0].split(",")[1])} r={3} fill={item.color} /> : null}
                    </g>
                  );
                })}
              </g>
            );
          })}
          {hover !== null ? (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={padding.top} y2={padding.top + innerH} className="ds-chart-cursor" />
              {series.map((item) => item.values[hover] == null ? null : <circle key={item.name} cx={x(hover)} cy={y(item.values[hover] as number)} r={4.5} fill="var(--ds-surface)" stroke={item.color} strokeWidth={2.2} />)}
            </g>
          ) : null}
          <rect x={padding.left} y={padding.top} width={innerW} height={innerH} fill="transparent" onPointerMove={(event) => onMove(event.clientX, (event.currentTarget as SVGRectElement).getBoundingClientRect())} />
        </svg>
      ) : null}
      {hover !== null && width > 0 ? (
        <div className="ds-chart-tip" style={{ insetInlineStart: Math.min(Math.max(8, width - x(hover) - 70), width - 150), top: 6 }}>
          <b>{labels[hover]}</b>
          {series.map((item) => item.values[hover] == null ? null : <span key={item.name}><i style={{ background: item.color }} aria-hidden="true" />{item.name}<em>{format(item.values[hover] as number)}</em></span>)}
        </div>
      ) : null}
      <ChartTable caption={caption} labels={labels} series={series} format={format} />
    </div>
  );
}

export function BarChart({ labels, values, format, caption, color = "var(--ds-chart-1)", height = 220, empty }: {
  labels: string[];
  values: number[];
  format: (value: number) => string;
  caption: string;
  color?: string;
  height?: number;
  empty?: ReactNode;
}) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (!values.some((value) => value > 0)) return <div className="ds-chart-empty" style={{ minHeight: height }}>{empty}</div>;

  const padding = { top: 14, right: 8, bottom: 28, left: 40 };
  const innerW = Math.max(40, width - padding.left - padding.right);
  const innerH = height - padding.top - padding.bottom;
  const max = niceMax(Math.max(...values));
  const slot = innerW / values.length;
  const barW = Math.min(44, slot * 0.58);
  // Oldest/nearest month at the right edge.
  const cx = (index: number) => padding.left + innerW - slot * (index + 0.5);

  return (
    <div className="ds-chart" ref={wrapRef} style={{ height }}>
      {width > 0 ? (
        <svg width={width} height={height} role="img" aria-label={caption}>
          {[0, 0.5, 1].map((fraction) => (
            <g key={fraction}>
              <line x1={padding.left} x2={width - padding.right} y1={padding.top + innerH - fraction * innerH} y2={padding.top + innerH - fraction * innerH} className="ds-chart-grid" />
              <text x={padding.left - 8} y={padding.top + innerH - fraction * innerH + 4} textAnchor="end" className="ds-chart-axis">{format(fraction * max)}</text>
            </g>
          ))}
          {values.map((value, index) => {
            const h = (value / max) * innerH;
            return (
              <g key={labels[index] + index} onPointerEnter={() => setHover(index)} onPointerLeave={() => setHover(null)}>
                <rect x={cx(index) - slot / 2} y={padding.top} width={slot} height={innerH} fill="transparent" />
                <rect x={cx(index) - barW / 2} y={padding.top + innerH - h} width={barW} height={Math.max(h, value > 0 ? 2 : 0)} rx={5} fill={color} opacity={hover === null || hover === index ? 1 : 0.45} />
                <text x={cx(index)} y={height - 8} textAnchor="middle" className="ds-chart-axis">{labels[index]}</text>
              </g>
            );
          })}
        </svg>
      ) : null}
      {hover !== null && width > 0 ? (
        <div className="ds-chart-tip" style={{ insetInlineStart: Math.min(Math.max(8, width - cx(hover) - 60), width - 140), top: 4 }}>
          <b>{labels[hover]}</b>
          <span>{format(values[hover])}</span>
        </div>
      ) : null}
      <ChartTable caption={caption} labels={labels} series={[{ name: caption, color, values }]} format={format} />
    </div>
  );
}

export type Slice = { label: string; value: number; color: string };

export function Donut({ slices, caption, centerLabel, format = (value) => String(value) }: { slices: Slice[]; caption: string; centerLabel: string; format?: (value: number) => string }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  if (!total) return null;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="ds-donut">
      <svg viewBox="0 0 140 140" width={148} height={148} role="img" aria-label={caption}>
        <circle cx={70} cy={70} r={radius} fill="none" stroke="var(--ds-surface-sunken)" strokeWidth={16} />
        {slices.filter((slice) => slice.value > 0).map((slice) => {
          const length = (slice.value / total) * circumference;
          const node = (
            <circle key={slice.label} cx={70} cy={70} r={radius} fill="none" stroke={slice.color} strokeWidth={16} strokeDasharray={`${Math.max(0, length - 2)} ${circumference}`} strokeDashoffset={-offset} transform="rotate(-90 70 70)" />
          );
          offset += length;
          return node;
        })}
        <text x={70} y={68} textAnchor="middle" className="ds-donut-total">{format(total)}</text>
        <text x={70} y={86} textAnchor="middle" className="ds-chart-axis">{centerLabel}</text>
      </svg>
      <ul className="ds-legend">
        {slices.map((slice) => (
          <li key={slice.label}>
            <i style={{ background: slice.color }} aria-hidden="true" />
            <span>{slice.label}</span>
            <b>{format(slice.value)}</b>
            <small>{Math.round((slice.value / total) * 100)}%</small>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Horizontal ranked bars (usage by customer, etc.).
export function BarList({ rows, format, empty }: { rows: { label: string; value: number; hint?: string; href?: string }[]; format: (value: number) => string; empty?: ReactNode }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (!rows.length || rows.every((row) => row.value === 0)) return <div className="ds-chart-empty">{empty}</div>;
  return (
    <ol className="ds-barlist">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="ds-barlist-head">
            {row.href ? <a href={row.href}>{row.label}</a> : <span>{row.label}</span>}
            <b>{format(row.value)}</b>
          </div>
          <div className="ds-meter" aria-hidden="true"><i style={{ width: `${(row.value / max) * 100}%` }} /></div>
          {row.hint ? <small>{row.hint}</small> : null}
        </li>
      ))}
    </ol>
  );
}
