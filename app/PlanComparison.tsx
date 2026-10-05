import { COMPARISON_ROWS, channelCell, liveCell, orderComparisonPlans, type ComparisonCell, type ComparisonPlan } from "../lib/plan-comparison";
import { planFeatures } from "../lib/plan-features";
import s from "./PlanComparison.module.css";

type Props = { plans: Array<ComparisonPlan & { id: string }>; lang: "ar" | "en" };

const copy = {
  ar: { title: "قارن بين الباقات والمزايا", sub: "كل ما تتضمنه كل باقة، في مكان واحد.", feature: "الميزة", currency: "ريال", month: "/ الشهر", included: "مشمول", notIncluded: "غير مشمول" },
  en: { title: "Compare plans and features", sub: "Everything each plan includes, in one place.", feature: "Feature", currency: "SAR", month: "/ month", included: "Included", notIncluded: "Not included" }
} as const;

function Cell({ cell, lang }: { cell: ComparisonCell; lang: "ar" | "en" }) {
  const text = copy[lang];
  if (cell === true) return <span className={s.yes} role="img" aria-label={text.included}>✓</span>;
  if (cell === false) return <span className={s.no} role="img" aria-label={text.notIncluded}>—</span>;
  return <span className={s.note}>{cell[lang]}</span>;
}

/** Feature-by-plan comparison table for the landing page (rows come from lib/plan-comparison.ts; numbers from the live plans). */
export default function PlanComparison({ plans, lang }: Props) {
  const text = copy[lang];
  const ordered = orderComparisonPlans(plans);
  if (ordered.length < 2) return null;

  return (
    <div className={s.wrap} id="compare">
      <div className={s.head}>
        <h3>{text.title}</h3>
        <p>{text.sub}</p>
      </div>
      <div className={s.scroll}>
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col" className={s.featureCol}>{text.feature}</th>
              {ordered.map((plan) => (
                <th scope="col" key={plan.id} className={planFeatures[plan.name]?.featured ? s.featured : undefined}>
                  <span className={s.planName}>{planFeatures[plan.name]?.shortName[lang] ?? plan.name}</span>
                  <span className={s.price}>{planFeatures[plan.name]?.custom ? <b>{lang === "ar" ? "حسب الطلب" : "On request"}</b> : <><b>{plan.monthlyPrice}</b> {text.currency} <small>{text.month}</small></>}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARISON_ROWS.map((row) => row.heading ? (
              <tr key={row.en} className={s.group}><th colSpan={ordered.length + 1} scope="colgroup">{row[lang]}</th></tr>
            ) : (
              <tr key={row.en}>
                <th scope="row" className={s.featureCol}>{row[lang]}</th>
                {ordered.map((plan, index) => (
                  <td key={plan.id} className={planFeatures[plan.name]?.featured ? s.featured : undefined}>
                    <Cell cell={row.channel ? channelCell(row.channel, plan) : row.live ? liveCell(row.live, plan) : row.cells?.[index] ?? false} lang={lang} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
