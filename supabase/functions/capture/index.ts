// Capture: photo/text -> structured meal estimate via the Claude API.
// Ports the health-tracker skill's estimation rules: component-by-component
// portions, confidence rating, trigger-watch flags from the profile's focus
// areas. Requires ANTHROPIC_API_KEY secret; auth is enforced by Supabase
// (verify_jwt), so only signed-in users can call it.

import { createClient } from "npm:@supabase/supabase-js@2";

// The project's publishable key. The legacy anon key is only a fallback for
// the environment that predates the new keys; it goes away once it is off.
const publishableKey = (): string =>
  JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default ??
    Deno.env.get("SUPABASE_ANON_KEY")!;

const TRIGGERS: Record<string, string[]> = {
  gerd: ["fried", "high-fat", "tomato", "citrus", "spicy", "chocolate", "coffee", "caffeine", "alcohol", "mint", "onion", "garlic", "carbonated", "late-evening large meal"],
  gut: ["dairy", "lactose", "wheat", "beans", "lentils", "onion", "garlic", "cruciferous", "sugar alcohols", "creamy", "high-fat", "carbonation"],
  perimenopause: ["alcohol", "caffeine", "spicy", "high-sugar", "late heavy meal"],
};

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    // Confirm the caller is a real signed-in user.
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      publishableKey(),
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } },
    );
    const { data: { user } } = await supa.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { kind, image_b64, media_type, text, focus_areas = [], watch_list = [] } = await req.json();

    const watchLists = (focus_areas as string[])
      .filter((f) => TRIGGERS[f])
      .map((f) => `${f}: ${TRIGGERS[f].join(", ")}`)
      .join("\n");

    // A spoken ramble is usually several entries at once — split it into rows
    // across all four log types, exactly like the skill does.
    if (kind === "ramble") {
      const rambleSystem = `You turn one spoken health-log ramble into structured entries.
The ramble may contain several entries at once: meals eaten, weight, blood sugar, blood pressure, sleep, workouts, and symptoms. Split it into its parts. Estimate nutrition for described meals (component by component, middle-of-range portions).
- Flag trigger_watch items ONLY from these lists (population-level commonalities, not verdicts):
${watchLists || "(none — leave trigger_watch empty)"}
${watch_list.length ? `- Personal watch list (always flag if present): ${watch_list.join(", ")}` : ""}
- glucose_context is one of: fasting, post-breakfast, post-lunch, post-dinner, random — infer from context ("this morning before breakfast" = fasting).
- symptom severity_1_5: 1 mild – 5 severe; infer conservatively from wording, default 3.
- Omit any list that has no entries. Never invent numbers that weren't said or clearly implied.
Respond with ONLY a JSON object, no prose:
{"meals":[{"description":string,"calories":int,"protein_g":num,"carbs_g":num,"sugar_g":num,"fiber_g":num,"fat_g":num,"confidence":"high"|"medium"|"low","trigger_watch":string[]}],
"vitals":[{"weight_lb":num,"glucose_mgdl":int,"glucose_context":string,"bp_systolic":int,"bp_diastolic":int,"sleep_hr":num}],
"exercise":[{"activity":string,"duration_min":int,"intensity":"easy"|"moderate"|"hard"}],
"symptoms":[{"symptom":string,"severity_1_5":int,"suspected_trigger":string,"notes":string}],
"summary":string}
"summary" is one short spoken-style confirmation, e.g. "logged breakfast (~520 cal), 214.2 lb, and the 20-minute walk".`;

      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 2048,
          system: rambleSystem,
          messages: [{ role: "user", content: [{ type: "text", text: `Split and structure this: ${text}` }] }],
        }),
      });

      if (!resp.ok) {
        console.error("Claude API error", resp.status, await resp.text());
        return new Response(JSON.stringify({ error: "Estimation service unavailable" }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
      }

      const data = await resp.json();
      // The response may contain multiple blocks (e.g. thinking) — take the last text block.
      const textBlocks = (data.content ?? []).filter((b: { type: string }) => b.type === "text");
      const raw = textBlocks.length ? textBlocks[textBlocks.length - 1].text : "";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      let entries = {};
      try { entries = JSON.parse(jsonMatch ? jsonMatch[0] : "{}"); } catch (_e) { /* fall through */ }
      const isEmpty = !entries || Object.keys(entries).length === 0;
      return new Response(
        JSON.stringify(isEmpty ? { entries, debug: { stop_reason: data.stop_reason, raw: raw.slice(0, 400), blocks: (data.content ?? []).map((b: { type: string }) => b.type) } } : { entries }),
        { headers: { ...cors, "Content-Type": "application/json" } },
      );
    }

    const system = `You estimate nutrition from meal photos or descriptions.
Rules, in order:
- Name every component you can see or that is described; estimate each separately, then total.
- Use objects in frame for scale (fork, hand, ~10-11in dinner plate, can).
- Portion size is the hard part — when unsure, assume the middle.
- confidence: "high" | "medium" | "low" — photos are usually medium at best.
- Flag trigger_watch items ONLY from these lists (population-level commonalities, not verdicts):
${watchLists || "(none — leave trigger_watch empty)"}
${watch_list.length ? `- Personal watch list (always flag if present): ${watch_list.join(", ")}` : ""}
Respond with ONLY a JSON object, no prose:
{"description": string, "calories": int, "protein_g": num, "carbs_g": num, "sugar_g": num, "fiber_g": num, "fat_g": num, "confidence": "high"|"medium"|"low", "trigger_watch": string[], "summary": string}
"summary" is one spoken-style sentence with the headline numbers, e.g. "call it 620 calories, 38g protein".`;

    const content: unknown[] = [];
    if (kind === "photo" && image_b64) {
      content.push({ type: "image", source: { type: "base64", media_type: media_type || "image/jpeg", data: image_b64 } });
      content.push({ type: "text", text: "Estimate this meal." });
    } else {
      content.push({ type: "text", text: `Estimate this meal: ${text}` });
    }

    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content }],
      }),
    });

    if (!resp.ok) {
      const detail = await resp.text();
      console.error("Claude API error", resp.status, detail);
      return new Response(JSON.stringify({ error: "Estimation service unavailable" }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const data = await resp.json();
    const raw = data.content?.[0]?.text ?? "{}";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const meal = JSON.parse(jsonMatch ? jsonMatch[0] : "{}");

    return new Response(JSON.stringify({ meal }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Capture failed" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
