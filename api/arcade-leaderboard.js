// /api/arcade-leaderboard.js
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ALLOWED_ORIGINS = new Set([
  "https://abielcryptocoin.com",
  "https://www.insert-crypto-coin.com",
  "https://insert-crypto-coin.com",
]);

export default async function handler(req, res) {
  // CORS for your frontend(s)
  const origin = req.headers.origin;

  // If the request comes from an allowed website, echo it back.
  // (Do NOT use "*" when sending cookies/auth; this is the safe approach.)
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Vary", "Origin"); // helps caching/CDNs behave correctly
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { game } = req.query;
  if (!game) {
    return res.status(400).json({ error: "Missing game param" });
  }

  try {
    const { data, error } = await supabase
      .from("arcade_scores")
      .select("initials, score, wallet, created_at") // ✅ wallet included
      .eq("game", game)
      .not("initials", "is", null)
      .order("score", { ascending: false })
      .order("created_at", { ascending: true }) // tie-breaker: older first
      .limit(10);

    if (error) {
      console.error("Leaderboard query error:", error);
      return res.status(500).json({ error: "DB error" });
    }

    return res.status(200).json({
      game,
      entries: data || [],
    });
  } catch (e) {
    console.error("Leaderboard handler error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}


