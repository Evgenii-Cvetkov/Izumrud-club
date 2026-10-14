import { describe, it, expect } from "vitest";
import {
  addOneMonth,
  hasAccess,
  onFirstPaymentSucceeded,
  onRenewalSucceeded,
  onRenewalFailed,
  onCancel,
  dueAction,
  emptySub,
  DAY,
  HOUR,
  type SubState,
} from "./subscription-rules";

const d = (s: string) => new Date(s);
const GRACE = 3;

describe("addOneMonth", () => {
  it("сдвигает на календарный месяц", () => {
    expect(addOneMonth(d("2026-10-14T10:00:00Z")).toISOString()).toBe("2026-11-14T10:00:00.000Z");
  });
  it("31 января → последний день февраля", () => {
    expect(addOneMonth(d("2026-01-31T10:00:00Z")).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(addOneMonth(d("2028-01-31T10:00:00Z")).toISOString()).toBe("2028-02-29T10:00:00.000Z");
  });
  it("декабрь → январь следующего года", () => {
    expect(addOneMonth(d("2026-12-20T00:00:00Z")).toISOString()).toBe("2027-01-20T00:00:00.000Z");
  });
});

describe("первый платёж и доступ", () => {
  it("открывает доступ на месяц", () => {
    const s = onFirstPaymentSucceeded(emptySub(), d("2026-10-14T10:00:00Z"), true);
    expect(s.status).toBe("active");
    expect(s.periodEnd?.toISOString()).toBe("2026-11-14T10:00:00.000Z");
    expect(hasAccess(s, d("2026-11-14T09:59:59Z"))).toBe(true);
    expect(hasAccess(s, d("2026-11-14T10:00:00Z"))).toBe(false);
  });
  it("pending и expired не дают доступа", () => {
    expect(hasAccess(emptySub())).toBe(false);
    expect(hasAccess({ ...emptySub(), status: "expired", periodEnd: d("2099-01-01") })).toBe(false);
  });
  it("оплата после отмены, пока доступ открыт, продлевает от конца периода", () => {
    const active = onFirstPaymentSucceeded(emptySub(), d("2026-10-01T00:00:00Z"), true);
    const cancelled = onCancel(active);
    const resumed = onFirstPaymentSucceeded(cancelled, d("2026-10-20T00:00:00Z"), true);
    expect(resumed.periodEnd?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(resumed.status).toBe("active");
  });
});

describe("продление", () => {
  const start = onFirstPaymentSucceeded(emptySub(), d("2026-10-14T10:00:00Z"), true);

  it("успех сдвигает период от конца прошлого", () => {
    const s = onRenewalSucceeded(start, start.periodEnd!);
    expect(s.periodStart?.toISOString()).toBe("2026-11-14T10:00:00.000Z");
    expect(s.periodEnd?.toISOString()).toBe("2026-12-14T10:00:00.000Z");
  });

  it("повторный вебхук того же продления ничего не меняет", () => {
    const once = onRenewalSucceeded(start, start.periodEnd!);
    const twice = onRenewalSucceeded(once, start.periodEnd!);
    expect(twice).toEqual(once);
  });

  it("неудача → past_due, 3 дня доступа, повторы через 24 и 48 ч, затем expired", () => {
    const failAt = start.periodEnd!;
    const s1 = onRenewalFailed(start, failAt, GRACE);
    expect(s1.status).toBe("past_due");
    expect(s1.graceUntil!.getTime()).toBe(failAt.getTime() + 3 * DAY);
    expect(s1.nextAttemptAt!.getTime()).toBe(failAt.getTime() + 24 * HOUR);
    expect(hasAccess(s1, new Date(failAt.getTime() + 2 * DAY))).toBe(true);

    const s2 = onRenewalFailed(s1, s1.nextAttemptAt!, GRACE);
    expect(s2.status).toBe("past_due");
    expect(s2.nextAttemptAt!.getTime()).toBe(failAt.getTime() + 48 * HOUR);
    expect(s2.graceUntil!.getTime()).toBe(s1.graceUntil!.getTime());

    const s3 = onRenewalFailed(s2, s2.nextAttemptAt!, GRACE);
    expect(s3.status).toBe("expired");
    expect(hasAccess(s3, s2.nextAttemptAt!)).toBe(false);
  });

  it("успех со второй попытки сохраняет дни участника", () => {
    const s1 = onRenewalFailed(start, start.periodEnd!, GRACE);
    const ok = onRenewalSucceeded(s1, start.periodEnd!);
    expect(ok.status).toBe("active");
    expect(ok.periodEnd?.toISOString()).toBe("2026-12-14T10:00:00.000Z");
    expect(ok.retryCount).toBe(0);
  });
});

describe("отмена", () => {
  const active = onFirstPaymentSucceeded(emptySub(), d("2026-10-14T10:00:00Z"), true);
  it("доступ до конца периода, автопродление выключено", () => {
    const s = onCancel(active);
    expect(s.status).toBe("cancelled");
    expect(s.autopayEnabled).toBe(false);
    expect(hasAccess(s, d("2026-11-01T00:00:00Z"))).toBe(true);
  });
  it("отмена при past_due закрывает доступ сразу", () => {
    const pastDue = onRenewalFailed(active, active.periodEnd!, GRACE);
    expect(onCancel(pastDue).status).toBe("expired");
  });
});

describe("dueAction для фоновой задачи", () => {
  const s: SubState = onFirstPaymentSucceeded(emptySub(), d("2026-10-14T10:00:00Z"), true);
  it("напоминание за 3 дня и только один раз", () => {
    expect(dueAction(s, d("2026-11-10T10:00:00Z"), true)).toBe(null);
    expect(dueAction(s, d("2026-11-11T10:00:00Z"), true)).toBe("remind");
    expect(dueAction({ ...s, reminderSentFor: s.periodEnd }, d("2026-11-12T10:00:00Z"), true)).toBe(null);
  });
  it("списание в момент окончания периода", () => {
    expect(dueAction(s, d("2026-11-14T10:00:00Z"), true)).toBe("charge");
  });
  it("без способа оплаты — истечение, а не списание", () => {
    expect(dueAction(s, d("2026-11-14T10:00:00Z"), false)).toBe("expire");
  });
  it("после отмены — истечение по окончании периода, без списаний", () => {
    const c = onCancel(s);
    expect(dueAction(c, d("2026-11-13T10:00:00Z"), true)).toBe(null);
    expect(dueAction(c, d("2026-11-14T10:00:00Z"), true)).toBe("expire");
  });
  it("past_due: повтор по расписанию, истечение после grace", () => {
    const p = onRenewalFailed(s, s.periodEnd!, GRACE);
    expect(dueAction(p, new Date(s.periodEnd!.getTime() + 23 * HOUR), true)).toBe(null);
    expect(dueAction(p, new Date(s.periodEnd!.getTime() + 24 * HOUR), true)).toBe("charge");
    expect(dueAction(p, new Date(s.periodEnd!.getTime() + 3 * DAY), true)).toBe("expire");
  });
});
