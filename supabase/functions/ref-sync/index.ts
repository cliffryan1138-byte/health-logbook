// ref-sync: fills the reference library's medicine part (migration 0017).
//
// For each medicine on a person's list it
//   1. matches the name to RxNorm (NLM's RxNav API) by exact, normalized name
//      — never an approximate match, so "not found" means not found;
//   2. finds the FDA label for that concept on openFDA: the products RxNorm
//      lists for it (single-ingredient only, for an ingredient), and of their
//      labels, the most recent;
//   3. stores the label's sections word for word, with its set id, version,
//      effective date and when it was fetched.
// The person's match goes in medication_refs (their own rows); the label in
// ref_drug_labels / ref_rx_labels (public data, keyed by RxNorm and label
// ids — no name a person typed is ever stored there).
//
// Two ways in (deployed with verify_jwt OFF, like ai-health):
//   - signed in (Authorization: Bearer <user JWT>): checks that person's
//     medicines; called by the app when a medicine is added or its label opened.
//   - weekly (x-cron-secret, pg_cron): re-checks every label older than 7 days
//     and every medicine not matched yet.
// Optional secret OPENFDA_API_KEY raises openFDA's daily limit; it works
// without one.

import { createClient } from "npm:@supabase/supabase-js@2";

const serverKey = (): string =>
  JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default ??
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, serverKey(), { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const WEEK_MS = 7 * 86400000;
const RXNAV = "https://rxnav.nlm.nih.gov/REST";
const OPENFDA = "https://api.fda.gov/drug/label.json";

// The label sections Daybook quotes (openFDA field names). Prescription
// labels use the first group; over-the-counter "Drug Facts" use the second.
const SECTIONS = [
  "boxed_warning", "warnings_and_cautions", "warnings", "contraindications", "adverse_reactions",
  "drug_interactions", "pregnancy", "teratogenic_effects", "lactation", "nursing_mothers",
  "pregnancy_or_breast_feeding", "do_not_use", "ask_doctor", "ask_doctor_or_pharmacist",
  "when_using", "stop_use", "indications_and_usage", "purpose", "information_for_patients",
];

async function getJson(url: string): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 20_000);
    try {
      const res = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "Daybook/1.0 (daybook.wastegate.ai)" } });
      if (res.status === 404) return null; // openFDA: no matches
      if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue; }
      if (!res.ok) throw new Error(`${new URL(url).host} HTTP ${res.status}`);
      return await res.json();
    } finally { clearTimeout(t); }
  }
  throw new Error(`${new URL(url).host} kept failing`);
}

// 1. Name -> RxNorm concept, exact normalized match only.
async function matchName(name: string) {
  const clean = name.replace(/\s+/g, " ").trim();
  const d = await getJson(`${RXNAV}/rxcui.json?name=${encodeURIComponent(clean)}&search=2`);
  const rxcui = d?.idGroup?.rxnormId?.[0];
  if (!rxcui) return { status: "not_found" as const };
  const p = await getJson(`${RXNAV}/rxcui/${rxcui}/properties.json`);
  return { status: "matched" as const, rxcui, rx_name: p?.properties?.name ?? null, tty: p?.properties?.tty ?? null };
}

// 2. Concept -> the products to look labels up by. A clinical or branded drug
//    is itself a product. A brand name expands to that brand's own products
//    only (so "Tylenol" never shows a store brand's label); an ingredient to
//    its products, single-ingredient only (a combination pill has its own).
async function productCuis(rxcui: string, tty: string | null): Promise<string[]> {
  if (tty && /^(SCD|SBD|GPCK|BPCK)$/.test(tty)) return [rxcui];
  const want = tty === "BN" ? "SBD+BPCK" : "SCD+SBD";
  const d = await getJson(`${RXNAV}/rxcui/${rxcui}/related.json?tty=${want}`);
  const out: string[] = [];
  for (const g of d?.relatedGroup?.conceptGroup ?? []) {
    for (const c of g.conceptProperties ?? []) if (tty === "BN" || !/ \/ /.test(c.name)) out.push(c.rxcui);
  }
  return [...new Set(out)].slice(0, 60);
}

async function findLabel(rxcui: string, tty: string | null) {
  const cuis = await productCuis(rxcui, tty);
  if (!cuis.length) return null;
  const key = Deno.env.get("OPENFDA_API_KEY");
  const ids = `openfda.rxcui:(${cuis.map((c) => `"${c}"`).join("+")})`;
  // The original maker's label first; a repackager's copy only if that's all there is.
  let url = "", d: any = null;
  for (const search of [`${ids}+AND+openfda.is_original_packager:true`, ids]) {
    url = `${OPENFDA}?search=${encodeURIComponent(search).replace(/%2B/g, "+")}&sort=effective_time:desc&limit=1`;
    d = await getJson(key ? `${url}&api_key=${key}` : url);
    if (d?.results?.length) break;
  }
  const r = d?.results?.[0];
  if (!r?.set_id) return null;
  const sections: Record<string, string[]> = {};
  for (const s of SECTIONS) if (Array.isArray(r[s]) && r[s].length) sections[s] = r[s].map((x: string) => String(x).slice(0, 60000));
  const eff = /^\d{8}$/.test(r.effective_time ?? "") ? `${r.effective_time.slice(0, 4)}-${r.effective_time.slice(4, 6)}-${r.effective_time.slice(6)}` : null;
  const of = r.openfda ?? {};
  return {
    set_id: r.set_id,
    version: r.version ?? null,
    effective_time: eff,
    title: [of.brand_name?.[0], of.generic_name?.[0]].filter(Boolean).join(" (") + (of.brand_name?.[0] && of.generic_name?.[0] ? ")" : ""),
    manufacturer: of.manufacturer_name?.[0] ?? null,
    generic_names: of.generic_name ?? [],
    brand_names: of.brand_name ?? [],
    rxcuis: of.rxcui ?? [],
    product_type: of.product_type?.[0] ?? null,
    route: of.route ?? [],
    sections,
    source_url: url, // without the key
    source_updated: d?.meta?.last_updated ?? null,
    retrieved_at: new Date().toISOString(),
  };
}

// 3. Make sure the label for a concept is stored and less than a week old.
async function ensureLabel(db: ReturnType<typeof admin>, rxcui: string, rx_name: string | null, tty: string | null, force = false) {
  const { data: have } = await db.from("ref_rx_labels").select("retrieved_at").eq("rxcui", rxcui).maybeSingle();
  if (have && !force && Date.now() - Date.parse(have.retrieved_at) < WEEK_MS) return "fresh";
  const label = await findLabel(rxcui, tty);
  if (label) {
    const { error } = await db.from("ref_drug_labels").upsert(label);
    if (error) throw error;
  }
  const { error } = await db.from("ref_rx_labels").upsert({
    rxcui, rx_name, tty, set_id: label?.set_id ?? null, status: label ? "found" : "not_found", retrieved_at: new Date().toISOString(),
  });
  if (error) throw error;
  return label ? "updated" : "not_found";
}

type Med = { id: string; profile_id: string; name: string };

async function checkMeds(db: ReturnType<typeof admin>, meds: Med[], forceLabels: boolean) {
  const out = { checked: 0, updated: 0, not_found: 0, results: [] as unknown[] };
  const ids = meds.map((m) => m.id);
  const { data: refs } = ids.length
    ? await db.from("medication_refs").select("medication_id, matched_name, status, rxcui, rx_name, tty, checked_at").in("medication_id", ids)
    : { data: [] };
  const byMed = new Map((refs ?? []).map((r: any) => [r.medication_id, r]));
  for (const m of meds) {
    out.checked++;
    let ref: any = byMed.get(m.id);
    const stale = !ref || ref.matched_name !== m.name || (ref.status === "not_found" && Date.now() - Date.parse(ref.checked_at) > WEEK_MS);
    if (stale) {
      const hit = await matchName(m.name);
      ref = { medication_id: m.id, profile_id: m.profile_id, matched_name: m.name, rxcui: hit.status === "matched" ? hit.rxcui : null,
        rx_name: hit.status === "matched" ? hit.rx_name : null, tty: hit.status === "matched" ? hit.tty : null, status: hit.status,
        checked_at: new Date().toISOString() };
      const { error } = await db.from("medication_refs").upsert(ref);
      if (error) throw error;
    }
    if (ref.status === "matched") {
      const r = await ensureLabel(db, ref.rxcui, ref.rx_name, ref.tty, forceLabels);
      if (r === "updated") out.updated++;
      if (r === "not_found") out.not_found++;
    } else out.not_found++;
    out.results.push({ medication_id: m.id, status: ref.status, rxcui: ref.rxcui });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const db = admin();

  // Weekly run from pg_cron.
  const secret = req.headers.get("x-cron-secret");
  if (secret) {
    const { data: ok } = await db.rpc("ops_cron_ok", { p_secret: secret });
    if (!ok) return json({ error: "forbidden" }, 403);
    const { data: run } = await db.from("ref_refresh_runs").insert({ kind: "weekly" }).select("id").single();
    try {
      // Every label older than a week, then every medicine not matched yet.
      const { data: old } = await db.from("ref_rx_labels").select("rxcui, rx_name, tty")
        .lt("retrieved_at", new Date(Date.now() - WEEK_MS).toISOString()).limit(400);
      let updated = 0, notFound = 0;
      for (const o of old ?? []) {
        const r = await ensureLabel(db, o.rxcui, o.rx_name, o.tty, true);
        if (r === "updated") updated++; else if (r === "not_found") notFound++;
      }
      const { data: meds } = await db.from("medications").select("id, profile_id, name").limit(2000);
      const res = await checkMeds(db, (meds ?? []) as Med[], false);
      await db.from("ref_refresh_runs").update({ finished_at: new Date().toISOString(), checked: (old?.length ?? 0) + res.checked,
        updated: updated + res.updated, not_found: notFound + res.not_found }).eq("id", run?.id);
      return json({ ok: true, labels_refreshed: old?.length ?? 0, medicines: res.checked });
    } catch (e) {
      await db.from("ref_refresh_runs").update({ finished_at: new Date().toISOString(), error: String(e).slice(0, 500) }).eq("id", run?.id);
      return json({ error: String(e).slice(0, 300) }, 500);
    }
  }

  // A signed-in person: their own medicines only.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "sign in first" }, 401);
  const { data: who, error: authErr } = await db.auth.getUser(token);
  if (authErr || !who?.user) return json({ error: "sign in first" }, 401);
  let body: { medication_ids?: string[] } = {};
  try { body = await req.json(); } catch { /* empty body: all their medicines */ }
  let q = db.from("medications").select("id, profile_id, name").eq("profile_id", who.user.id).is("stopped_on", null);
  if (Array.isArray(body.medication_ids) && body.medication_ids.length) q = q.in("id", body.medication_ids.slice(0, 50));
  const { data: meds, error } = await q.limit(50);
  if (error) return json({ error: error.message }, 500);
  try {
    const res = await checkMeds(db, (meds ?? []) as Med[], false);
    await db.from("ref_refresh_runs").insert({ kind: "on_demand", finished_at: new Date().toISOString(), checked: res.checked, updated: res.updated, not_found: res.not_found });
    return json({ ok: true, ...res });
  } catch (e) {
    return json({ error: "The medicine lookup isn't answering right now. Try again later." , detail: String(e).slice(0, 300) }, 502);
  }
});
