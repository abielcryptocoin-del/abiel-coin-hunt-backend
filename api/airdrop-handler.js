// /api/airdrop-handler.js
import {
  Connection,
  PublicKey,
  Transaction,
  Keypair,
  sendAndConfirmTransaction
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction
} from "@solana/spl-token";
import { createClient } from "@supabase/supabase-js";

console.log("🚀 airdrop-handler v4.4 — restored working logic + Supabase logging");

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const connection = new Connection(RPC_URL, "confirmed");

// === SUPABASE ===
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// === CONFIG ===
const ABC_MINT = new PublicKey("7YESrv9LkAhAQH2kkvbDGjmgnJ94FTFapDQqR6YWUtFc");

// Treasury (receiver)
const PRESALE_COLLECTION_WALLET = new PublicKey("GdguGxvuYJQuMkNWswLATrqryW6PqwerwwEUYFmXmi67");
// Presale wallet (sends ABC)
const AIRDROP_SOURCE_WALLET = new PublicKey("GLbyyEP5AWMnVUvVikhH6LtRTyohFtBQBaTHMKpQBg9K");

// Private key for presale wallet
const secret = JSON.parse(process.env.AIRDROP_SECRET_KEY);
const AIRDROP_KEYPAIR = Keypair.fromSecretKey(Uint8Array.from(secret));

// === SETTINGS ===
const ABC_RATE_USDC = 700; // 1 USDC = 700 ABC
const TOKEN_DECIMALS = 6;

// === Helper: fetch current SOL→USD price ===
async function getSolPriceUSD() {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
    );
    const data = await res.json();
    const price = data.solana?.usd || 0;
    console.log(`💲 Current SOL/USD price: ${price}`);
    return price;
  } catch (e) {
    console.error("⚠️ Failed to fetch SOL price:", e);
    return 0;
  }
}

// === MAIN HANDLER ===
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Only POST allowed" });
  }

  try {
    const event = req.body[0];
    if (!event) return res.status(400).json({ error: "Invalid webhook payload" });

    console.log("🎯 Webhook event received:", event.description || "No description");
    console.log("🧠 Full nativeTransfers:", JSON.stringify(event.nativeTransfers || [], null, 2));

    const txSignature = event.signature;
    const nativeTransfers = event.nativeTransfers || [];
    const tokenTransfers = event.tokenTransfers || [];

    let buyer = null;
    let amount = 0;
    let abcToSend = 0;

    // === Simple SOL detection (restored behaviour) ===
    const solTx = nativeTransfers[0];
    if (solTx) {
      buyer =
        solTx.fromUserAccount ||
        solTx.fromAccount ||
        solTx.source ||
        solTx.fromUser ||
        null;
      amount = solTx.amount / 1e9; // lamports → SOL

      const solPriceUSD = await getSolPriceUSD();
      abcToSend = Math.floor(amount * solPriceUSD * ABC_RATE_USDC * 10 ** TOKEN_DECIMALS);
    }

    // === USDC transfer fallback ===
    if (!solTx && tokenTransfers.length > 0) {
      const usdcTx = tokenTransfers[0];
      buyer =
        usdcTx.fromUserAccount ||
        usdcTx.fromAccount ||
        usdcTx.source ||
        null;
      amount = usdcTx.tokenAmount / 1e6;
      abcToSend = Math.floor(amount * ABC_RATE_USDC * 10 ** TOKEN_DECIMALS);
    }

    // === Final validation ===
    if (!buyer || buyer.length < 32) {
      console.log("⚠️ No valid buyer detected — skipping.");
      return res.status(200).json({ ignored: "invalid_buyer" });
    }
    if (abcToSend <= 0) {
      console.log("⚠️ ABC amount zero — skipping.");
      return res.status(200).json({ ignored: "zero_amount" });
    }

    console.log(`💰 Buyer ${buyer} paid ${amount}`);
    console.log(`🎁 Sending ${abcToSend / 10 ** TOKEN_DECIMALS} ABC`);

    // === Duplicate protection (Supabase) ===
    const { data: existing, error: checkError } = await supabase
      .from("presale_logs")
      .select("tx_signature")
      .eq("tx_signature", txSignature)
      .maybeSingle();

    if (checkError) console.error("⚠️ Supabase duplicate-check error:", checkError.message);
    if (existing) {
      console.log("⚠️ Duplicate transaction — skipping airdrop.");
      return res.status(200).json({ ignored: "duplicate" });
    }

    // === Execute ABC transfer ===
    const buyerPubkey = new PublicKey(buyer);
    const fromATA = await getAssociatedTokenAddress(ABC_MINT, AIRDROP_SOURCE_WALLET);
    const toATAAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      AIRDROP_KEYPAIR,
      ABC_MINT,
      buyerPubkey
    );
    const toATA = toATAAccount.address;

    const ix = createTransferInstruction(fromATA, toATA, AIRDROP_SOURCE_WALLET, abcToSend);
    const tx = new Transaction().add(ix);
    const sig = await sendAndConfirmTransaction(connection, tx, [AIRDROP_KEYPAIR]);

    console.log(`✅ Airdrop sent: https://solscan.io/tx/${sig}`);

    // === Log in Supabase ===
    const { error: dbError } = await supabase.from("presale_logs").insert([
      {
        buyer,
        sol_amount: amount,
        abc_amount: abcToSend / 10 ** TOKEN_DECIMALS,
        tx_signature: txSignature || sig
      }
    ]);
    if (dbError) console.error("⚠️ Failed to log in Supabase:", dbError.message);
    else console.log("🧾 Sale logged successfully.");

    return res.status(200).json({ success: true, tx: sig });
  } catch (err) {
    console.error("❌ Airdrop error:", err);
    return res.status(500).json({ error: err.message });
  }
}
