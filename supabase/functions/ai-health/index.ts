// ai-health: is Claude still answering Daybook? Run every 15 minutes by
// pg_cron (migration 0009). Emails Cliff when it stops, every 6 hours while it
// stays down, and once more when it's back.
//
// On 2026-10-07 the API key stopped working and photos, imports and Sparky all
// failed for hours before a tester noticed. This sends Claude the smallest
// possible request with the same ANTHROPIC_API_KEY the other functions use —
// one word in, one token out, on the cheapest model — and reports what came
// back. No health data is involved.
//
// Authentication: deployed with verify_jwt OFF, because pg_cron has no user
// session. Instead every call must carry the x-cron-secret header, which only
// the database knows; it is checked before anything else happens.
//
// Email goes through Resend (secrets RESEND_API_KEY and ALERT_EMAIL). Until
// those are set the function still checks and remembers, and retries the
// email on the next run.
//
// A drill: POST {"drill": "key" | "credit" | "outage" | "ok"} with the secret
// runs the same path under the separate check name "test", so a test email can
// be sent without touching the real state.

import { createClient } from "npm:@supabase/supabase-js@2";

// The project's secret (server-only) key: the ops_* functions are executable
// by service_role alone, so nothing public can reach them (migration 0011).
const serverKey = (): string =>
  JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type Kind = "ok" | "key" | "credit" | "permission" | "rate_limited" | "outage" | "error";
type Probe = { ok: boolean; kind: Kind; detail: string };

const PROBE_MODEL = "claude-haiku-4-5-20251001";

// One word to the cheapest model. Classify whatever comes back.
async function probe(): Promise<Probe> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return { ok: false, kind: "key", detail: "ANTHROPIC_API_KEY is not set" };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctl.signal,
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: PROBE_MODEL, max_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
    });
    if (res.ok) return { ok: true, kind: "ok", detail: "" };
    let message = "";
    try { message = (await res.json())?.error?.message ?? ""; } catch { /* not JSON */ }
    const detail = `HTTP ${res.status}${message ? `: ${message}` : ""}`.slice(0, 300);
    if (res.status === 401) return { ok: false, kind: "key", detail };
    if (res.status === 403) return { ok: false, kind: "permission", detail };
    if (res.status === 400 && /credit|billing|balance/i.test(message)) return { ok: false, kind: "credit", detail };
    if (res.status === 429) return { ok: false, kind: "rate_limited", detail };
    if (res.status >= 500) return { ok: false, kind: "outage", detail };
    return { ok: false, kind: "error", detail };
  } catch (e) {
    return { ok: false, kind: "outage", detail: e instanceof Error && e.name === "AbortError" ? "No answer within 20 s" : `Network error: ${String(e).slice(0, 200)}` };
  } finally {
    clearTimeout(timer);
  }
}

const KEYS_URL = "https://console.anthropic.com/settings/keys";
const BILLING_URL = "https://console.anthropic.com/settings/billing";
const SECRETS_URL = "https://supabase.com/dashboard/project/ivymolvqxbychmylezdx/functions/secrets";
const AFFECTED = "Taking a picture, talking to Sparky, importing old notes or PDF logs, and reading workout plans";

function when(iso: string) {
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }) + " Eastern";
}

function email(alert: string, p: Probe, since: string, drill: boolean) {
  const tag = drill ? "[TEST] " : "";
  const tail = drill
    ? "\n\nThis was a drill: nothing is actually broken. The real check runs every 15 minutes."
    : "\n\nDaybook checks every 15 minutes. You'll get an all-clear email when it works again, and a reminder every 6 hours until then.";
  if (alert === "up") {
    return {
      subject: `${tag}Daybook: AI features are working again`,
      text: `Claude is answering Daybook again.\n\nIt was down from ${when(since)} until ${when(new Date().toISOString())}.\n\n${AFFECTED} should all work now. If anyone's app still shows an error, they can close it fully and reopen it.${drill ? tail : ""}`,
    };
  }
  const fix: Record<string, [string, string]> = {
    key: ["Claude rejected Daybook's API key",
      `To fix it (about two minutes):\n1. Create a new key: ${KEYS_URL}\n2. Paste it into ANTHROPIC_API_KEY here: ${SECRETS_URL}\nIt takes effect right away; nothing needs redeploying.`],
    credit: ["the Anthropic account is out of credit",
      `To fix it: add credit or turn on auto-reload here: ${BILLING_URL}`],
    permission: ["Daybook's API key isn't allowed to use the model",
      `Check the key's workspace and permissions here: ${KEYS_URL}`],
    rate_limited: ["Claude has been turning Daybook away for an hour (rate limited)",
      `Usually this passes on its own. If it keeps happening, check the account's limits: ${BILLING_URL}`],
    outage: ["Claude isn't answering",
      `This is most likely on Anthropic's side; check https://status.anthropic.com. Nothing needs changing unless it lasts.`],
    error: ["Claude is refusing Daybook's requests",
      `The answer below should say why. If it mentions the model, the model name in the functions may need updating.`],
  };
  const [what, how] = fix[p.kind] ?? fix.error;
  return {
    subject: `${tag}Daybook: AI features are down — ${what}`,
    text: `${alert === "reminder" ? "Still down. " : ""}Since ${when(since)}, ${what}.\n\nAffected: ${AFFECTED}. Everything else in Daybook (logging by hand, the logbook, exports) still works.\n\n${how}\n\nWhat Claude answered: ${p.detail || "(nothing)"}${tail}`,
  };
}

// A pasted secret often carries a stray space, quotes or a "Bearer " prefix.
const clean = (v: string | undefined) =>
  (v ?? "").trim().replace(/^["']+|["']+$/g, "").replace(/^Bearer\s+/i, "").trim();

// What a secret looks like, never what it is: enough to spot a bad paste.
const shape = (v: string) => `starts "${v.slice(0, 3)}", ${v.length} chars${/\s/.test(v) ? ", contains whitespace" : ""}`;

async function send(subject: string, text: string): Promise<string | null> {
  const key = clean(Deno.env.get("RESEND_API_KEY"));
  const to = clean(Deno.env.get("ALERT_EMAIL"));
  if (!key || !to) return "RESEND_API_KEY or ALERT_EMAIL is not set";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    // onboarding@resend.dev can send only to the Resend account's own address,
    // which is exactly who these are for, and needs no DNS records.
    body: JSON.stringify({ from: "Daybook alerts <onboarding@resend.dev>", to: [to], subject, text }),
  });
  if (res.ok) return null;
  return `Resend HTTP ${res.status}: ${(await res.text()).slice(0, 200)} (key ${shape(key)}; Resend keys start "re_")`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const secret = req.headers.get("x-cron-secret") ?? "";
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, serverKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Authenticate before spending anything.
  const { data: allowed } = await supa.rpc("ops_cron_ok", { p_secret: secret });
  if (allowed !== true) return json({ error: "Not allowed" }, 401);

  let body: { drill?: string } = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const drills: Record<string, Probe> = {
    key: { ok: false, kind: "key", detail: "HTTP 401: invalid x-api-key (drill)" },
    credit: { ok: false, kind: "credit", detail: "HTTP 400: Your credit balance is too low (drill)" },
    outage: { ok: false, kind: "outage", detail: "HTTP 529: Overloaded (drill)" },
    ok: { ok: true, kind: "ok", detail: "" },
  };
  const drill = typeof body.drill === "string" && body.drill in drills;
  const name = drill ? "test" : "anthropic";
  const result = drill ? drills[body.drill!] : await probe();

  const { data: rec, error } = await supa.rpc("ops_record_ai_check", {
    p_secret: secret, p_name: name, p_ok: result.ok, p_kind: result.kind, p_detail: result.detail,
  });
  if (error) {
    console.error("ai-health: could not record the check", error.message);
    return json({ error: "Could not record the check" }, 500);
  }

  const alert = rec?.alert as string | null;
  let emailed = false;
  if (alert) {
    const m = email(alert, result, rec.since, drill);
    const failed = await send(m.subject, m.text);
    if (failed) {
      console.error(`ai-health: ${alert} email not sent:`, failed);
      await supa.rpc("ops_alert_not_sent", { p_secret: secret, p_name: name, p_alert: alert });
    } else {
      emailed = true;
    }
  }
  if (!result.ok) console.error(`ai-health: ${name} ${result.kind} (${rec?.fail_count} in a row): ${result.detail}`);
  return json({ check: name, ok: result.ok, kind: result.kind, alert, emailed });
});
