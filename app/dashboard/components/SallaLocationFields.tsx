"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "../i18n";

type Location = { id: string; name: string; nameEn: string; code: string };
export type LocationChoice = { countryId: string; cityId: string; districtId: string; country: string; countryCode: string; city: string; district: string };

const EMPTY: LocationChoice = { countryId: "", cityId: "", districtId: "", country: "", countryCode: "", city: "", district: "" };

/** Country, city and district chosen from Salla's own lists (Salla identifies them by id). The current values pre-select the matching entries. */
export default function SallaLocationFields({ current, onChange }: { current: { country: string; city: string; district: string }; onChange: (choice: LocationChoice) => void }) {
  const { t } = useLanguage();
  const [countries, setCountries] = useState<Location[]>([]);
  const [cities, setCities] = useState<Location[]>([]);
  const [districts, setDistricts] = useState<Location[]>([]);
  const [choice, setChoice] = useState<LocationChoice>(EMPTY);
  const [error, setError] = useState("");

  const same = (item: Location, value: string) => {
    const v = value.trim().toLowerCase();
    return Boolean(v) && [item.name, item.nameEn, item.code].some((candidate) => candidate.trim().toLowerCase() === v);
  };

  function update(next: LocationChoice) {
    setChoice(next);
    onChange(next);
  }

  async function load(type: "countries" | "cities" | "districts", parent = ""): Promise<Location[] | null> {
    try {
      const response = await fetch(`/api/store-integrations/salla/locations?type=${type}${parent ? `&parent=${encodeURIComponent(parent)}` : ""}`, { cache: "no-store" });
      const result = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; data?: { items: Location[] } } | null;
      if (!response.ok || !result?.ok || !result.data) {
        setError(result?.error || t("تعذر جلب القوائم من سلة", "Could not load the lists from Salla"));
        return null;
      }
      return result.data.items;
    } catch {
      setError(t("تعذر الاتصال بالخادم", "Could not reach the server"));
      return null;
    }
  }

  useEffect(() => {
    let cancelled = false;
    void load("countries").then((items) => {
      if (cancelled || !items) return;
      setCountries(items);
      const found = items.find((item) => same(item, current.country)) ?? items.find((item) => /saudi|السعود/i.test(`${item.name} ${item.nameEn}`));
      if (found) update({ ...EMPTY, countryId: found.id, country: found.name, countryCode: found.code });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!choice.countryId) return;
    let cancelled = false;
    setCities([]);
    setDistricts([]);
    void load("cities", choice.countryId).then((items) => {
      if (cancelled || !items) return;
      setCities(items);
      const found = items.find((item) => same(item, current.city));
      if (found) update({ ...choice, cityId: found.id, city: found.name, districtId: "", district: "" });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice.countryId]);

  useEffect(() => {
    if (!choice.cityId) return;
    let cancelled = false;
    setDistricts([]);
    void load("districts", choice.cityId).then((items) => {
      if (cancelled || !items) return;
      setDistricts(items);
      const found = items.find((item) => same(item, current.district));
      if (found) update({ ...choice, districtId: found.id, district: found.name });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choice.cityId]);

  return (
    <>
      <label>
        {t("الدولة", "Country")}
        <select value={choice.countryId} onChange={(event) => {
          const item = countries.find((entry) => entry.id === event.target.value);
          update({ ...EMPTY, countryId: event.target.value, country: item?.name ?? "", countryCode: item?.code ?? "" });
        }}>
          <option value="">{t("اختر الدولة", "Choose a country")}</option>
          {countries.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label>
        {t("المدينة", "City")}
        <select value={choice.cityId} disabled={!choice.countryId} onChange={(event) => {
          const item = cities.find((entry) => entry.id === event.target.value);
          update({ ...choice, cityId: event.target.value, city: item?.name ?? "", districtId: "", district: "" });
        }}>
          <option value="">{t("اختر المدينة", "Choose a city")}</option>
          {cities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label>
        {t("الحي", "District")}
        <select value={choice.districtId} disabled={!choice.cityId} onChange={(event) => {
          const item = districts.find((entry) => entry.id === event.target.value);
          update({ ...choice, districtId: event.target.value, district: item?.name ?? "" });
        }}>
          <option value="">{t("اختر الحي (اختياري)", "Choose a district (optional)")}</option>
          {districts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      {error ? <span className="store-orders-error" style={{ gridColumn: "1 / -1" }}>{error}</span> : null}
    </>
  );
}
