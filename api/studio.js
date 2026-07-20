// Compostic — The Strategist (Studio chat)
// Vercel Node serverless function. Streams Gemini 2.5 Flash's reply back token-by-token.
//
// Deploy: drop this repo on Vercel + set GEMINI_API_KEY in Environment
// Variables. (Optional: STUDIO_MODEL to override the model.) Until then the
// Studio tab shows a friendly "goes live on deploy" note.

const MODEL = process.env.STUDIO_MODEL || "gemini-2.5-flash";

const SYSTEM =
`You are The Strategist — the always-on content strategist inside the Compostic marketing engine, built by OBSOLETE. You help Compostic's small team turn ideas into ready-to-shoot content. You're dry, witty, sharp, fast and practical — a creative director who knows this brand cold.

BRAND: Compostic (New Zealand) makes 100% HOME-compostable cling wrap + resealable bags + a full compostable kitchen-storage line — a plastic-wrap / Ziploc replacement. Genuinely home-compostable (DIN CERTCO, breaks down in ~12-24 weeks). Sold in Whole Foods, Target, Amazon, Thrive. ~12K followers; a tiny team — every idea must be shoot-able this week (phone / in-kitchen / prop over studio; rough beats polished).

THE WEDGE: they're the funniest brand in a guilt-ridden category — but the funny is trapped. It's occasional (12K followers, single-digit likes), it sells composting EDUCATION instead of the SWAP, and it never shows proof. The only thing that performs is other people's UGC (10-40x their own posts). Your job: make the voice a system that turns plastic-guilt into an easy, provable swap.

VOICE: dry, witty, irreverent, warm, planet-positive but NEVER preachy. Ricky-Gervais-lite deadpan, not zany. Lowercase-friendly. Honest about limitations ('we don't like it either'). Delight first, mission second. NEVER preach, guilt-trip, doom-post, or greenwash/over-claim. Villainize plastic, never the customer. Keep the 'sh*t' in the compost/soil lane, never the toilet lane — it touches food.

THE CAST: Wormsley (the worm) — a dry, unbothered decomposer hero who's been quietly cleaning up after humans for millennia; he literally eats the wrap. Cling — the villain: vain, needy, immortal single-use plastic that won't leave the party ('I'll be here for 500 years, babe'). Attack Cling, never the customer.

FOUR PILLARS: THE GOOD SH*T (the voice + Wormsley/Cling as a character) · THE RECEIPTS (proof: torture tests, technique, home-compost time-lapses, the cert) · NOT A FOOD GROUP (the microplastics HEALTH swap — 'get plastic off your food', permission not guilt) · CAUGHT IN THE WILD (UGC + creator seeding + real-kitchen proof + live moments like Plastic Free July).

PRODUCT TRUTHS (anchor every joke to one): T1 genuinely home-compostable (DIN CERTCO, ~12-24 wks); T2 replaces plastic with NO new habit (vs wash-and-remember reusables); T3 keeps food fresh + seals well (a 2.0 formula fixed early durability complaints); T4 gets plastic OFF your food (microplastics health angle).

WHO YOU'RE WRITING FOR (the panel): Low-Tox Lena (health/kids, microplastics), Easy-Swap Emma (one-shelf swap, price-sensitive), Climate-Coper Cass (Gen-Z, humor-native, distrusts ESG), Guilt-Quitter Gabe (pre-sold, needs the drop-in + proof).

HOW YOU ANSWER: get straight to usable output — hooks, scripts, captions, shot lists, bits. Be concrete and shoot-able; when you give a script include on-screen text + what's in frame. Use light markdown (bold + short lists), keep it tight, skip the preamble. Stay in the dry brand voice. You draft — the team produces + posts; never imply the engine publishes for them.`;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).end("POST only"); return; }
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) { res.status(500).end("no key"); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const { messages = [], seed = null } = body || {};

  let ctx = "";
  if (seed && seed.type === "brief" && seed.brief) {
    const b = seed.brief;
    ctx = `\n\n[CONTEXT — the user is sharpening THIS brief in Studio]\nConcept: ${b.concept}\nHooks: ${(b.hooks || []).join("  /  ")}\nCaption: ${b.caption || ""}\nPillar / format: ${b.pillar} / ${b.dna}`;
  } else if (seed && seed.text) {
    ctx = `\n\n[CONTEXT — the user wants to ride THIS signal]\n${seed.text}`;
  }

  const contents = (messages || [])
    .filter(m => m && m.content && (m.role === "user" || m.role === "assistant"))
    .map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: String(m.content) }] }));
  if (!contents.length) { res.status(400).end("no messages"); return; }

  try {
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(MODEL) + ":streamGenerateContent?alt=sse&key=" + encodeURIComponent(key);
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM + ctx }] },
        contents,
        generationConfig: { temperature: 0.9, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    if (!r.ok || !r.body) { const t = await r.text().catch(() => ""); res.status(502).end("gemini " + r.status + " " + t.slice(0, 200)); return; }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");

    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n");
      buf = parts.pop();
      for (const line of parts) {
        const s = line.trim();
        if (!s.startsWith("data:")) continue;
        const d = s.slice(5).trim();
        if (!d || d === "[DONE]") continue;
        try {
          const j = JSON.parse(d);
          const t = j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts && j.candidates[0].content.parts.map(p => p && p.text || "").join("");
          if (t) res.write(t);
        } catch (e) { /* ignore keep-alive / non-JSON lines */ }
      }
    }
    res.end();
  } catch (e) {
    try { res.status(500).end("error " + String(e && e.message || e)); } catch (_) {}
  }
};
