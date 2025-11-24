import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { game, wallet, score, level, ts } = req.body || {};

    if (!wallet || typeof score !== "number") {
      return res.status(400).json({ error: "Missing wallet or score" });
    }

    const { error } = await supabase
      .from("arcade_scores")
      .insert({
        game: game || "space_invaders",
        wallet,
        score,
        level: level ?? null,
        created_at: ts || new Date().toISOString()
      });

    if (error) {
      console.error("Supabase insert error:", error);
      return res.status(500).json({ error: "Supabase insert failed" });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("arcade-score handler error:", err);
    return res.status(500).json({ error: "Unexpected error" });
  }
}
