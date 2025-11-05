// /api/airdrop-handler.js — debug version to test Helius webhook

export default async function handler(req, res) {
  // ✅ Allow requests from external sources like Helius
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end(); // ✅ Preflight success
  }

  console.log("🚀 Webhook hit:", req.method);
  console.log("📦 Body:", JSON.stringify(req.body, null, 2));
  console.log("🧾 Headers:", req.headers);

  // Always respond 200 so we can confirm receipt
  return res.status(200).json({ success: true });
}
