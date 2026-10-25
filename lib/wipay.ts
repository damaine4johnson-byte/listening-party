import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

export const PLATFORM_FEE_PERCENT = 10;
export const MIN_ENTRY_FEE_CENTS = 100;
export const MAX_ENTRY_FEE_CENTS = 100_000;
export const MIN_TIP_CENTS = 200;
export const MAX_TIP_CENTS = 20_000;

export class PaymentsNotConfiguredError extends Error {}

function config() {
  const accountNumber = process.env.WIPAY_ACCOUNT_NUMBER;
  const apiKey = process.env.WIPAY_API_KEY;
  if (!accountNumber || !apiKey) return null;
  const environment = process.env.WIPAY_ENVIRONMENT === "live" ? "live" : "sandbox";
  const countryCode = (process.env.WIPAY_COUNTRY_CODE ?? "JM").toUpperCase();
  return { accountNumber, apiKey, environment, countryCode } as const;
}

export function isWipayConfigured() {
  return config() !== null;
}

export function platformFeeCents(amountCents: number) {
  return Math.round((amountCents * PLATFORM_FEE_PERCENT) / 100);
}

export function formatTotal(amountCents: number) {
  return (amountCents / 100).toFixed(2);
}

// Creates a WiPay hosted checkout for an order and returns the URL to send the listener to.
export async function createWipayCheckout(input: { orderId: string; amountCents: number; origin: string }) {
  const settings = config();
  if (!settings) throw new PaymentsNotConfiguredError("WiPay is not configured.");

  const host = `${settings.countryCode.toLowerCase()}${settings.environment === "sandbox" ? "sb" : ""}.wipayfinancial.com`;
  const body = new URLSearchParams({
    account_number: settings.accountNumber,
    country_code: settings.countryCode,
    currency: "USD",
    environment: settings.environment,
    fee_structure: "merchant_absorb",
    method: "credit_card_co",
    order_id: input.orderId,
    origin: "FamousIntrovertListeningRooms",
    response_url: `${input.origin}/api/payments/wipay/return`,
    total: formatTotal(input.amountCents),
  });
  const response = await fetch(`https://${host}/plugins/payments/request`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const result = await response.json().catch(() => null) as { url?: string; message?: string } | null;
  if (!response.ok || !result?.url) throw new Error(result?.message ?? "WiPay checkout could not be created.");
  return { url: result.url };
}

// hash = md5(transaction_id + original_total + api_key), using the total we stored, never the one in the redirect.
export function verifyWipayHash(transactionId: string, amountCents: number, hash: string) {
  const settings = config();
  if (!settings) return false;
  const expected = createHash("md5").update(`${transactionId}${formatTotal(amountCents)}${settings.apiKey}`).digest("hex");
  const given = hash.toLowerCase();
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
