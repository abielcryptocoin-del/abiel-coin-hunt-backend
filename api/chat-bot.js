// /api/chat-bot.js
import { createClient } from "@supabase/supabase-js";

const BOT_NAME = "ARCADEBOT";
const MAX_BATCH = 50;

// Env vars in Vercel:
// SUPABASE_URL
// SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function buildWelcome(room, username) {
  const roomPretty = `#${room}`;
  return `Welcome ${username} to ${roomPretty}. Type /help for commands.`;
}

function buildCommandReply(room, cmd) {
  switch (cmd) {
    case "/help":
      return `Commands: /help /rules /play | Mention me: @arcadebot <question>`;
    case "/rules":
      return `Rules: keep it friendly. No spam. High-scores welcome. Weekly leaderboard resets weekly.`;
    case "/play":
      // adjust to your redirect(s)
      return `Play: https://insert-crypto-coin.com/arcade/`;
    default:
      return null;
  }
}

function buildMentionReply(text) {
  // MVP: canned responses. Later: AI.
  const t = text.toLowerCase();

  if (t.includes("score") && (t.includes("submit") || t.includes("send"))) {
    return `Scores submit at game over. If it fails, refresh and try once. If it still fails, tell me which game + device.`;
  }

  if (t.includes("weekly")) {
    return `Weekly boards reset weekly. Your best run in the week is what counts.`;
  }

  return `I’m still learning. Try /help, or ask about scores, weekly boards, or game tips.`;
}

async function alreadyProcessed(id) {
  const { data, error } = await supabase
    .from("chat_bot_processed")
    .select("message_id")
    .eq("message_id", id)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

async function markProcessed(id) {
  const { error } = await supabase.from("chat_bot_processed").insert({ message_id: id });
  if (error) {
    // Ignore duplicate insert race
    if (!String(error.message || "").toLowerCase().includes("duplicate")) throw error;
  }
}

async function postBotMessage(room_slug, message, reply_to = null) {
  const payload = {
    room_slug,
    username: BOT_NAME,
    message: message.slice(0, 220),
    // if you later add columns:
    // is_bot: true,
    // reply_to
  };

  const { error } = await supabase.from("chat_messages").insert(payload);
  if (error) throw error;
}

async function isFirstMessageInRoom(room_slug, username, created_at) {
  // Check if any earlier messages exist by this username in this room
  const { count, error } = await supabase
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("room_slug", room_slug)
    .eq("username", username)
    .lt("created_at", created_at);

  if (error) throw error;
  return (count || 0) === 0;
}

export default async function handler(req, res) {
  try {
    // Optional shared secret if you don’t want public triggering
    // if (req.query.key !== process.env.CHAT_BOT_KEY) return res.status(401).send("nope");

    // Grab latest messages across rooms (or filter by time)
    const { data: msgs, error } = await supabase
      .from("chat_messages")
      .select("id, room_slug, username, message, created_at")
      .order("created_at", { ascending: false })
      .limit(MAX_BATCH);

    if (error) throw error;

    // Process oldest-first so replies make sense in order
    const batch = [...(msgs || [])].reverse();

    let actions = 0;

    for (const m of batch) {
      if (!m?.id) continue;
      if (m.username === BOT_NAME) continue;

      const done = await alreadyProcessed(m.id);
      if (done) continue;

      const text = (m.message || "").trim();
      const lower = text.toLowerCase();

      // 1) Welcome on first message in room
      if (await isFirstMessageInRoom(m.room_slug, m.username, m.created_at)) {
        await postBotMessage(m.room_slug, buildWelcome(m.room_slug, m.username), m.id);
        actions++;
      }

      // 2) Slash commands
      if (text.startsWith("/")) {
        const cmd = text.split(/\s+/)[0];
        const reply = buildCommandReply(m.room_slug, cmd);
        if (reply) {
          await postBotMessage(m.room_slug, reply, m.id);
          actions++;
        }
      }

      // 3) Mention
      if (lower.includes("@arcadebot")) {
        const reply = buildMentionReply(text);
        if (reply) {
          await postBotMessage(m.room_slug, reply, m.id);
          actions++;
        }
      }

      await markProcessed(m.id);
    }

    res.status(200).json({ ok: true, processed: batch.length, actions });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
