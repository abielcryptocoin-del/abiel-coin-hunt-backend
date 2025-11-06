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

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);


console.log("🚀 airdrop-handler v3.5 — LIVE BUILD ENABLED");

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const connection = new Connection(RPC_URL, "confirmed");

// === CONFIG ===
const ABC_MINT = new PublicKey("7YESrv9LkAhAQH2kkvbDGjmgnJ94FTFapDQqR6YWUtFc");
const PRESALE_COLLECTION_WALLET = new PublicKey("GLbyyEP5AWMnVUvVikhH6LtRTyohFtBQBaTHMKpQBg9K"); // buyers send SOL/USDC here
const AIRDROP_SOURCE_WALLET = new PublicKey("GdguGxvuYJQuMkNWswLATrqryW6PqwerwwEUYFmXmi67"); // wallet holding 100M ABC

// Load the private key of AIRDROP_SOURCE_WALLET
const secret = JSON.parse(process.env.AIRDROP_SECRET_KEY);
const AIRDROP_KEYPAIR = Keypair.fromSecretKey(Uint8Array.from(secret));

// === SETTINGS ===
const ABC_RATE = 700;        // 1 SOL (or 1 USDC) = 700 ABC
const TOKEN_DECIMALS = 6;    // ABC token decimals

// === MAIN HANDLER ===
export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ message: "Only POST allowed" });

  try {
    console.log("🎯 Webhook event received:", JSON.stringify(req.body, null, 2));
    const event = req.body[0];
    if (!event) return res.status(400).json({ error: "Invalid webhook payload" });

    const nativeTransfers = event.nativeTransfers || [];
    const tokenTransfers = event.tokenTransfers || [];

    let buyer = null;
    let amount = 0;

    // 1️⃣ Detect SOL transfer
    const solTx = nativeTransfers.find(
      (t) => t.toUserAccount === PRESALE_COLLECTION_WALLET.toString()
    );
    if (solTx) {
      buyer = solTx.fromUserAccount;
      amount = solTx.amount / 1e9; // lamports → SOL
    }

    // 2️⃣ Detect USDC transfer (optional)
    const usdcTx = tokenTransfers.find(
      (t) => t.toUserAccount === PRESALE_COLLECTION_WALLET.toString()
    );
    if (usdcTx) {
      buyer = usdcTx.fromUserAccount;
      amount = usdcTx.tokenAmount / 1e6; // USDC decimals
    }

    if (!buyer || amount <= 0) {
      console.log("⚠️ No valid incoming payment, skipping.");
      return res.status(200).json({ ignored: true });
    }

    console.log(`💰 Buyer ${buyer} paid ${amount} (SOL/USDC)`);

    // 3️⃣ Calculate ABC to send
    const abcToSend = Math.floor(amount * ABC_RATE * 10 ** TOKEN_DECIMALS);
    console.log(`🎁 Sending ${abcToSend / 10 ** TOKEN_DECIMALS} ABC to ${buyer}`);

    // 4️⃣ Prepare token accounts
    const buyerPubkey = new PublicKey(buyer);
    const fromATA = await getAssociatedTokenAddress(ABC_MINT, AIRDROP_SOURCE_WALLET);
    const toATAAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      AIRDROP_KEYPAIR,
      ABC_MINT,
      buyerPubkey
    );
    const toATA = toATAAccount.address;

    // 5️⃣ Create transfer instruction
    const ix = createTransferInstruction(
      fromATA,
      toATA,
      AIRDROP_SOURCE_WALLET,
      abcToSend
    );

    // 6️⃣ Send transaction
    const tx = new Transaction().add(ix);
    const sig = await sendAndConfirmTransaction(connection, tx, [AIRDROP_KEYPAIR]);

    console.log(`✅ Airdrop successful: https://solscan.io/tx/${sig}`);
    console.log("✅ VERIFIED LIVE BUILD — ABC transfer executed");

    return res.status(200).json({ success: true, tx: sig });

    // 7️⃣ Log the sale in Supabase
    try {
      const { error: dbError } = await supabase.from("presale_logs").insert([
        {
          buyer,
          sol_amount: amount,
          abc_amount: abcToSend / 10 ** TOKEN_DECIMALS,
          tx_signature: sig
        }
      ]);
    
      if (dbError) {
        console.error("⚠️ Failed to log to Supabase:", dbError.message);
      } else {
        console.log("🧾 Sale logged in Supabase");
      }
    } catch (logErr) {
      console.error("⚠️ Logging exception:", logErr);
    }

    
  } catch (err) {
    console.error("❌ Airdrop error:", err);
    return res.status(500).json({ error: err.message });
  }
}
