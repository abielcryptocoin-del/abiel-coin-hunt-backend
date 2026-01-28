import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ISO week id like "2026-W05" (UTC-based to avoid timezone edge cases)
function getISOWeekId(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;          // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);  // nearest Thursday
  const isoYear = d.getUTCFullYear();

  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);

  return `${isoYear}-W${String(weekNo).padStart(2, "0")}`;
}

export default async function handler(req, res) {
  // --- CORS ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only POST allowed
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { game, wallet, score, level, initials, ts } = req.body;

    if (!wallet || typeof score !== "number") {
      return res.status(400).json({ error: "Missing wallet or score" });
    }

    // Clean initials to 3 letters A–Z
    let initialsClean = null;
    if (typeof initials === "string") {
      initialsClean = initials.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
      if (initialsClean.length === 0) initialsClean = null;
    }

    // Respect provided ts for created_at, but compute week_id from that same moment
    const createdAt = ts || new Date().toISOString();
    const week_id = getISOWeekId(new Date(createdAt));

    const { error } = await supabase
      .from("arcade_scores")
      .insert({
        game: game || "space_invaders",
        wallet,
        score,
        level: level ?? null,
        initials: initialsClean,
        created_at: createdAt,
        week_id
      });

    if (error) {
      console.error("Supabase insert error:", error);
      return res.status(500).json({ error: "Supabase insert failed" });
    }

    return res.status(200).json({ ok: true, week_id });
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: "Unexpected error" });
  }
}
