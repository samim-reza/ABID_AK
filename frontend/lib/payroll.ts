/** Standard monthly working hours used for hourly-worker basic and monthly OT rate. */
export const MONTHLY_HOURS = 260;

export function defaultBasic(payType: string, baseRate: number): number {
  if (payType === "hourly") return +(baseRate * MONTHLY_HOURS).toFixed(2);
  return baseRate;
}

/** Hourly rate used to convert overtime hours → SAR. */
export function overtimeHourlyRate(payType: string, baseRate: number): number {
  if (payType === "hourly") return baseRate;
  return baseRate / MONTHLY_HOURS;
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
