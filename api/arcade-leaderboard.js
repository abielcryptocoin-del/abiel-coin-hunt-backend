// /api/arcade-leaderboard.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // CORS for your frontend
  res.setHeader("Access-Control-Allow-Origin", "https://abielcryptocoin.com");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { game } = req.query;
  if (!game) {
    return res.status(400).json({ error: "Missing game param" });
  }

  try {
    const { data, error } = await supabase
      .from("arcade_scores")
      .select("initials, score, ts")
      .eq("game", game)
      .not("initials", "is", null)
      .order("score", { ascending: false })
      .order("ts", { ascending: true })  // tie-breaker: older first
      .limit(10);

    if (error) {
      console.error("Leaderboard query error:", error);
      return res.status(500).json({ error: "DB error" });
    }

    return res.status(200).json({
      game,
      entries: data || []
    });
  } catch (e) {
    console.error("Leaderboard handler error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}
