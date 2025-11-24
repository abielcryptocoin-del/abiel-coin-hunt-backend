import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {

  // --- CORS ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { game, wallet, score, level, ts } = req.body;

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
    console.error("Handler error:", err);
    return res.status(500).json({ error: "Unexpected error" });
  }
}
