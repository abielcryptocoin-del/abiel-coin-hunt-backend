// /api/airdrop-handler.js — debug version to confirm Helius connection

export default async function handler(req, res) {
  console.log("🚀 Webhook hit:", req.method);
  console.log("📦 Body:", JSON.stringify(req.body, null, 2));
  console.log("🧾 Headers:", req.headers);

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Only POST allowed" });
  }

  // Always respond success for now — just to confirm webhook hits
  return res.status(200).json({ success: true });
}
