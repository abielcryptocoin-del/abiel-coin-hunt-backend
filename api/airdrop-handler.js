// /api/airdrop-handler.js
import { Connection, PublicKey } from "@solana/web3.js";

console.log("🚀 airdrop-handler v3.1 — deployment check active");

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const connection = new Connection(RPC_URL, "confirmed");

// === CONFIG ===
const ABC_MINT = new PublicKey("7YESrv9LkAhAQH2kkvbDGjmgnJ94FTFapDQqR6YWUtFc");
const PRESALE_COLLECTION_WALLET = new PublicKey("GLbyyEP5AWMnVUvVikhH6LtRTyohFtBQBaTHMKpQBg9K");
const AIRDROP_SOURCE_WALLET = new PublicKey("GdguGxvuYJQuMkNWswLATrqryW6PqwerwwEUYFmXmi67");

// === MAIN HANDLER ===
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Only POST allowed" });
  }

  try {
    console.log("🎯 Incoming webhook body:");
    console.log(JSON.stringify(req.body, null, 2));

    const event = req.body[0];
    if (!event) {
      console.log("⚠️ No event object found in body");
      return res.status(400).json({ error: "Invalid webhook payload" });
    }

    const nativeTransfers = event.nativeTransfers || [];
    const tokenTransfers = event.tokenTransfers || [];

    console.log(`📦 Event type: ${event.type}`);
    console.log(`💰 Native transfers count: ${nativeTransfers.length}`);
    console.log(`🪙 Token transfers count: ${tokenTransfers.length}`);

    const solTx = nativeTransfers.find(
      (t) => t.toUserAccount === PRESALE_COLLECTION_WALLET.toString()
    );
    const usdcTx = tokenTransfers.find(
      (t) => t.toUserAccount === PRESALE_COLLECTION_WALLET.toString()
    );

    if (solTx) {
      console.log(`✅ SOL received from ${solTx.fromUserAccount}`);
      console.log(`   Amount: ${solTx.amount / 1e9} SOL`);
    } else if (usdcTx) {
      console.log(`✅ USDC received from ${usdcTx.fromUserAccount}`);
      console.log(`   Amount: ${usdcTx.tokenAmount / 1e6} USDC`);
    } else {
      console.log("⚠️ No transfer to presale wallet detected");
    }

    console.log("🧾 Deployment check complete — no tokens sent");
    console.log("✅ VERIFIED LIVE BUILD");

    return res.status(200).json({
      version: "3.1-check",
      message: "Webhook received and logged (no transfers executed)",
      verified: true,
    });
  } catch (err) {
    console.error("❌ Error in deployment check:", err);
    return res.status(500).json({ error: err.message });
  }
}
