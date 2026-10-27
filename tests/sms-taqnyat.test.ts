import { afterEach, describe, expect, it, vi } from "vitest";
import { getSmsAccount, sendSms, smsCredentials, taqnyatErrorMessage, taqnyatNumber } from "../lib/sms-send";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

afterEach(() => vi.unstubAllGlobals());

describe("Taqnyat SMS", () => {
  it("reads the key and sender from the saved SMS settings", () => {
    expect(smsCredentials({ accessToken: " key ", phoneNumber: " Linkly " })).toEqual({ apiKey: "key", sender: "Linkly" });
    expect(smsCredentials({ accessToken: "key", phoneNumber: "" })).toBeNull();
    expect(smsCredentials({ accessToken: "", phoneNumber: "Linkly" })).toBeNull();
  });

  it("writes numbers in international format without 00 or +", () => {
    expect(taqnyatNumber("0551234567")).toBe("966551234567");
    expect(taqnyatNumber("551234567")).toBe("966551234567");
    expect(taqnyatNumber("+966 55 123 4567")).toBe("966551234567");
    expect(taqnyatNumber("00966551234567")).toBe("966551234567");
    expect(taqnyatNumber("abc")).toBe("");
    expect(taqnyatNumber("123")).toBe("");
  });

  it("sends with the Bearer key, the recipient list, the body and the sender", async () => {
    const fetchMock = vi.fn(async () => json({ messageId: 98765, cost: 0.1, currency: "SAR", totalCount: 1, accepted: ["966551234567"], rejected: [] }, 201));
    vi.stubGlobal("fetch", fetchMock);
    const result = await sendSms({ apiKey: "secret-key", sender: "Linkly", to: "0551234567", text: "مرحبا" });
    expect(result).toEqual({ messageId: "98765", cost: 0.1, currency: "SAR" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.taqnyat.sa/v1/messages");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-key");
    expect(JSON.parse(String(init.body))).toEqual({ recipients: ["966551234567"], body: "مرحبا", sender: "Linkly" });
  });

  it("says Taqnyat's refusals in Arabic and never calls it for a bad number", async () => {
    const fetchMock = vi.fn(async () => json({ message: "Balance is zero or insufficient" }, 400));
    vi.stubGlobal("fetch", fetchMock);
    await expect(sendSms({ apiKey: "k", sender: "Linkly", to: "0551234567", text: "x" })).rejects.toThrow("رصيد تقنيات غير كافٍ");
    fetchMock.mockClear();
    await expect(sendSms({ apiKey: "k", sender: "Linkly", to: "12", text: "x" })).rejects.toThrow("رقم الجوال غير صحيح");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a rejected recipient as a failure even on a 201", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ messageId: 1, accepted: [], rejected: ["966551234567"] }, 201)));
    await expect(sendSms({ apiKey: "k", sender: "Linkly", to: "0551234567", text: "x" })).rejects.toThrow("رفضت تقنيات الرقم");
  });

  it("maps the documented error texts", () => {
    expect(taqnyatErrorMessage("", 401)).toContain("مفتاح API غير صحيح");
    expect(taqnyatErrorMessage("Sender name not accepted", 400)).toContain("اسم المرسل");
    expect(taqnyatErrorMessage("IP not authorized", 400)).toContain("إعدادات الأمان");
    expect(taqnyatErrorMessage("", 503)).toContain("غير متاحة مؤقتًا");
    expect(taqnyatErrorMessage("something new", 400)).toContain("something new");
  });

  it("checks the key with the balance call", async () => {
    const fetchMock = vi.fn(async () => json({ accountStatus: "active", balance: 42.5, currency: "SAR" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await getSmsAccount("k")).toEqual({ ok: true, balance: 42.5, currency: "SAR", status: "active" });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe("https://api.taqnyat.sa/account/balance");
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "Unauthorized" }, 401)));
    expect(await getSmsAccount("bad")).toMatchObject({ ok: false });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    expect(await getSmsAccount("k")).toMatchObject({ ok: false });
  });
});
