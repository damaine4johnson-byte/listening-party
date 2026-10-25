import "server-only";

function baseUrl() {
  return process.env.PAYPAL_ENVIRONMENT === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

export function isPayPalConfigured() {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

async function accessToken() {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PayPal is not configured.");
  const response = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  const result = await response.json() as { access_token?: string };
  if (!response.ok || !result.access_token) throw new Error("PayPal authentication failed.");
  return result.access_token;
}

export type PayoutItem = { senderItemId: string; email: string; amountCents: number; note: string };

// Sends a batch of USD payouts. The batch id doubles as PayPal's idempotency key.
export async function sendPayPalPayouts(batchId: string, items: PayoutItem[]) {
  const token = await accessToken();
  const response = await fetch(`${baseUrl()}/v1/payments/payouts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      sender_batch_header: {
        sender_batch_id: batchId,
        email_subject: "Your Famous Introvert Listening Rooms earnings",
      },
      items: items.map((item) => ({
        recipient_type: "EMAIL",
        receiver: item.email,
        amount: { value: (item.amountCents / 100).toFixed(2), currency: "USD" },
        note: item.note,
        sender_item_id: item.senderItemId,
      })),
    }),
    cache: "no-store",
  });
  const result = await response.json() as { batch_header?: { payout_batch_id?: string }; message?: string };
  if (!response.ok) throw new Error(result.message ?? "PayPal payout failed.");
  return { paypalBatchId: result.batch_header?.payout_batch_id ?? null };
}
