/** Standard monthly working hours — full-month basic ↔ hours are linked via this. */
export const MONTHLY_HOURS = 260;

export function defaultBasic(payType: string, baseRate: number): number {
  if (payType === "hourly") return +(baseRate * MONTHLY_HOURS).toFixed(2);
  return baseRate;
}

/** Effective SAR/hour from worker pay type + base rate (same basis as OT). */
export function overtimeHourlyRate(payType: string, baseRate: number): number {
  if (payType === "hourly") return baseRate;
  return baseRate / MONTHLY_HOURS;
}

/** Basic / total amount from hours worked (linked fields). */
export function basicFromHours(payType: string, baseRate: number, hours: number): number {
  return +(overtimeHourlyRate(payType, baseRate) * hours).toFixed(2);
}

/** Hours worked from basic / total amount (linked fields). */
export function hoursFromBasic(payType: string, baseRate: number, basic: number): number {
  const rate = overtimeHourlyRate(payType, baseRate);
  if (!rate) return 0;
  return +(basic / rate).toFixed(2);
}

export function calcOvertimeAmount(payType: string, baseRate: number, hours: number): number {
  return +(overtimeHourlyRate(payType, baseRate) * hours).toFixed(2);
}

/** Reverse-calculate OT hours from a stored amount (for older records). */
export function overtimeHoursFromAmount(payType: string, baseRate: number, amount: number): number | null {
  if (!amount || !baseRate) return null;
  const rate = overtimeHourlyRate(payType, baseRate);
  if (!rate) return null;
  return +(amount / rate).toFixed(2);
}
