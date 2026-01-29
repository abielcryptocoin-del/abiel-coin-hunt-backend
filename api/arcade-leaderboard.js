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

function clampInt(v, min, max, fallback) {
  const n = parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const game = String(req.query.game || "").trim();
  if (!game) return res.status(400).json({ error: "Missing game param" });

  // Frontend uses limit=10; keep top=10 as a fallback.
  const limit = clampInt(req.query.limit ?? req.query.top, 1, 100, 10);

  // period=alltime|weekly (frontend sends this)
  const period = String(req.query.period || "alltime").toLowerCase();
  const weekId = String(req.query.week_id || "").trim(); // e.g. 2026-W05

  try {
    let q = supabase
      .from("arcade_scores")
      .select("initials, score, wallet, created_at, week_id, game");

    // Support your existing behaviour: frontend calls per-game,
    // but this keeps the API robust.
    if (game !== "all") {
      q = q.eq("game", game);
    }

    // Filter bad initials (null or empty string)
    q = q.not("initials", "is", null).neq("initials", "");

    // Weekly filter (this is the missing piece)
    if (period === "weekly") {
      if (!weekId) {
        return res.status(400).json({ error: "Missing week_id for weekly period" });
      }
      q = q.eq("week_id", weekId);
    }

    const { data, error } = await q
      .order("score", { ascending: false })
      .order("created_at", { ascending: true }) // tie-breaker: older first
      .limit(limit);

    if (error) {
      console.error("Leaderboard query error:", error);
      return res.status(500).json({ error: "DB error" });
    }

    return res.status(200).json({
      game,
      period,
      week_id: period === "weekly" ? weekId : null,
      entries: data || [],
    });
  } catch (e) {
    console.error("Leaderboard handler error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}
