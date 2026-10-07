import { createHmac } from "crypto";
import { config } from "../config.js";

export interface SendResult {
  ok: boolean;
  status: number;
  body: string;
}

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Signature scheme (must match lib/discord/signature.ts):
 *   hex(HMAC-SHA256(secret, rawBody)) in `x-discord-signature`.
 */
export function signBody(rawBody: string, secret: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

/**
 * POST a webhook payload to the attendance API.
 * Retries up to 3x with exponential backoff on network errors / 5xx.
 * Never logs the secret or the full signature.
 */
export async function sendEvent(payload: unknown): Promise<SendResult> {
  const rawBody = JSON.stringify(payload);
  const signature = signBody(rawBody, config.webhookSecret);

  let lastStatus = 0;
  let lastBody = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(config.attendanceApiUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-discord-signature": signature,
        },
        body: rawBody,
      });
      const text = await res.text().catch(() => "");
      lastStatus = res.status;
      lastBody = text;

      if (res.ok) {
        return { ok: true, status: res.status, body: text };
      }

      // Retry only on 5xx (and 429). 4xx is a client error — don't retry.
      const retryable = res.status >= 500 || res.status === 429;
      if (!retryable || attempt === MAX_ATTEMPTS) {
        console.error(
          `[attendance] POST failed status=${res.status} attempt=${attempt}/${MAX_ATTEMPTS} body=${text.slice(0, 500)}`,
        );
        return { ok: false, status: res.status, body: text };
      }

      console.warn(
        `[attendance] retryable status=${res.status} attempt=${attempt}/${MAX_ATTEMPTS}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[attendance] fetch error attempt=${attempt}/${MAX_ATTEMPTS}: ${msg}`);
      if (attempt === MAX_ATTEMPTS) {
        return { ok: false, status: lastStatus, body: lastBody || msg };
      }
    }

    await sleep(BASE_DELAY_MS * 2 ** (attempt - 1));
  }

  return { ok: false, status: lastStatus, body: lastBody };
}
