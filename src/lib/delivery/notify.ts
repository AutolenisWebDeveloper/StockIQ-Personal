// Alert delivery — Resend email + optional Telegram. Raw HTTPS (no SDK).
// Degrades gracefully: if a channel's keys are missing it logs and returns
// false, so the in-app notification is still recorded and the run never crashes.

export type Channel = "email" | "telegram";

async function sendEmail(subject: string, body: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL_TO ?? process.env.SEED_USER_EMAIL;
  if (!key || !to) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: process.env.ALERT_EMAIL_FROM ?? "StockIQ <alerts@stockiq.local>",
        to,
        subject,
        text: body,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function sendTelegram(body: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: body }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Deliver a message on a channel. Returns whether external delivery succeeded. */
export async function deliver(channel: Channel, subject: string, body: string): Promise<boolean> {
  if (channel === "telegram") return sendTelegram(`${subject}\n${body}`);
  return sendEmail(subject, body);
}
