// Compostic — live Swap Panel
// Vercel Node serverless function. Reads a brief, asks Claude to react AS the
// four audience personas, returns { reactions: [{key,score,line,share}] }.
//
// Deploy: drop this repo on Vercel and set ANTHROPIC_API_KEY in the project's
// Environment Variables. (Optional: PANEL_MODEL to override the model.)
// Until then the engine falls back to the modeled read automatically.

const MODEL = process.env.PANEL_MODEL || "claude-sonnet-5";

const PERSONAS = [
  { key: "lena", name: "Low-Tox Lena",
    bio: "30-45, runs the household on 'remove the nasties.' Health- and kids-driven, NOT planet-driven. Buys to get microplastics/plastic off her family's food. Rejects perfectionism ('awareness, not perfection') and hates being preached at. The anchor buyer + repeat purchaser." },
  { key: "emma", name: "Easy-Swap Emma",
    bio: "28-42, eco-curious but time- and budget-poor. Converts on low-friction, one-shelf-at-a-time swaps with real performance parity. Price premium vs plastic is her #1 objection. Needs it to actually work." },
  { key: "cass", name: "Climate-Coper Cass",
    bio: "18-27, climate-anxious but ALLERGIC to earnestness. Copes through irony + humor, distrusts every brand ESG claim, lives on TikTok. Loves a genuinely funny character; bounces off doom, lectures, and 'what is composting' textbook content. Rarely buys full price but makes it a thing / amplifies." },
  { key: "gabe", name: "Guilt-Quitter Gabe",
    bio: "35-60, already hates that he still uses plastic wrap. Triggered by a plastic headline or a store bag-ban. Pre-sold on the why — just needs the easy drop-in replacement, proof it works + breaks down, and permission to not feel lectured." },
];

const SYSTEM =
`You are a synthetic consumer panel for Compostic, a New Zealand brand making 100% HOME-compostable cling wrap + resealable bags (a plastic-wrap / Ziploc replacement) with a dry, witty, irreverent, planet-positive-not-preachy voice, a worm mascot named Wormsley (the dry decomposer hero) and a villain named Cling (vain, immortal single-use plastic).
You role-play FOUR distinct shoppers reacting to a single proposed social post. Stay ruthlessly in each persona's point of view — they disagree with each other. Be honest: if a brief is weak, preachy, education-only with no proof, or not for them, say so and score it low. Do not be a cheerleader. Reward: genuine humor, visible proof (it works / it breaks down), the microplastics HEALTH frame, and an easy low-friction swap. Penalize: preaching, guilt, doom, greenwashing/over-claiming, and 'what is composting' textbook content with no bridge to the swap.
For each persona return:
- score: 0-100, how likely THIS persona is to stop, save/share, and actually SWITCH based on THIS post.
- line: 1-2 sentences in their own first-person voice reacting to the post (specific to the brief, not generic).
- share: one of "would share", "would save", "would switch", or "would scroll past".
Return ONLY valid JSON, no prose, in exactly this shape:
{"reactions":[{"key":"lena","score":0,"line":"","share":""},{"key":"emma","score":0,"line":"","share":""},{"key":"cass","score":0,"line":"","share":""},{"key":"gabe","score":0,"line":"","share":""}]}`;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "POST only" }); return; }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) { res.status(500).json({ error: "ANTHROPIC_API_KEY not set" }); return; }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const { concept = "", hooks = [], caption = "", pillar = "", dna = "" } = body || {};

  const user =
`PROPOSED POST
Concept: ${concept}
Content pillar: ${pillar}  ·  Format: ${dna}
Hook options: ${(hooks || []).join("  /  ")}
Caption: ${caption}

THE FOUR PERSONAS
${PERSONAS.map(p => `- ${p.key} (${p.name}): ${p.bio}`).join("\n")}

React as all four. Return ONLY the JSON.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: SYSTEM,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!r.ok) { const t = await r.text(); res.status(502).json({ error: "anthropic " + r.status, detail: t.slice(0, 400) }); return; }
    const j = await r.json();
    const txt = (j.content && j.content[0] && j.content[0].text) || "";
    const m = txt.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(m ? m[0] : txt);
    res.status(200).json({ reactions: parsed.reactions || [] });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
};
