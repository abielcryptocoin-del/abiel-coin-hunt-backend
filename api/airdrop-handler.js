// /api/airdrop-handler.js
import { Connection, PublicKey, Transaction, Keypair } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
} from "@solana/spl-token";
import { createClient } from "@supabase/supabase-js";

console.log("🚀 airdrop-handler — dynamic SOL→USD rate + Supabase logging");

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
const PRESALE_COLLECTION_WALLET = new PublicKey("GLbyyEP5AWMnVUvVikhH6LtRTyohFtBQBaTHMKpQBg9K"); // receives SOL/USDC
const AIRDROP_SOURCE_WALLET = new PublicKey("GdguGxvuYJQuMkNWswLATrqryW6PqwerwwEUYFmXmi67");   // holds and sends ABC

// Load the private key for the wallet that will SEND the ABC
const secret = JSON.parse(process.env.AIRDROP_SECRET_KEY);
const AIRDROP_KEYPAIR = Keypair.fromSecretKey(Uint8Array.from(secret));

// === SETTINGS ===
const ABC_RATE_USDC = 700; // 1 USDC = 700 ABC
const TOKEN_DECIMALS = 6;

// === Helper: get current SOL→USD price ===
async function getSolPriceUSD() {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      { cache: "no-store" }
    );
    const data = await res.json();
    const price = data.solana?.usd || 0;
    console.log(`💲 Current SOL/USD price: ${price}`);
    return price > 0 ? price : 150; // fallback to $150 if CoinGecko fails
  } catch (e) {
    console.error("⚠️ Failed to fetch SOL price, using fallback 150:", e);
    return 150;
  }
}

// === MAIN HANDLER ===
export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ message: "Only POST allowed" });

  try {
    console.log("🎯 Webhook event received:", JSON.stringify(req.body, null, 2));
    const event = req.body[0];

    const nativeTransfers = event.nativeTransfers || [];
    const tokenTransfers = event.tokenTransfers || [];

    let buyer = null;
    let amount = 0;
    let abcToSend = 0;

    // === Detect SOL payment ===
    const solTx = nativeTransfers.find(
      (t) => t.toUserAccount === PRESALE_COLLECTION_WALLET.toString()
    );
    if (solTx) {
      buyer = solTx.fromUserAccount;
      amount = solTx.amount / 1e9; // lamports → SOL

      // Convert to USD and calculate ABC
      const solPriceUSD = await getSolPriceUSD();
      const usdValue = amount * solPriceUSD;
      abcToSend = Math.floor(usdValue * ABC_RATE_USDC * 10 ** TOKEN_DECIMALS);

      console.log(`💵 ${amount} SOL ≈ ${usdValue.toFixed(2)} USD → ${abcToSend / 10 ** TOKEN_DECIMALS} ABC`);
    }

    // === Detect USDC payment ===
    const usdcTx = tokenTransfers.find(
      (t) => t.toUserAccount === PRESALE_COLLECTION_WALLET.toString()
    );
    if (usdcTx) {
      buyer = usdcTx.fromUserAccount;
      amount = usdcTx.tokenAmount / 1e6; // USDC decimals
      abcToSend = Math.floor(amount * ABC_RATE_USDC * 10 ** TOKEN_DECIMALS);
    }

    if (!buyer || amount <= 0) {
      console.log("⚠️ No valid buyer or amount, skipping.");
      return res.status(200).json({ ignored: true });
    }

    console.log(`💰 Buyer ${buyer} paid ${amount} (SOL/USDC)`);
    console.log(`🎁 Sending ${abcToSend / 10 ** TOKEN_DECIMALS} ABC`);

    // === Prepare transfer ===
    const buyerPubkey = new PublicKey(buyer);
    const fromATA = await getAssociatedTokenAddress(ABC_MINT, AIRDROP_SOURCE_WALLET);
    const toATA = await getAssociatedTokenAddress(ABC_MINT, buyerPubkey);

    const ix = createTransferInstruction(fromATA, toATA, AIRDROP_SOURCE_WALLET, abcToSend);
    const tx = new Transaction().add(ix);
    tx.feePayer = AIRDROP_SOURCE_WALLET;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    // === Send ===
    const sig = await connection.sendTransaction(tx, [AIRDROP_KEYPAIR]);
    console.log(`✅ Airdrop sent: https://solscan.io/tx/${sig}`);

    // === Log to Supabase ===
    const { error } = await supabase.from("presale_logs").insert([
      {
        buyer,
        sol_amount: amount,
        abc_amount: abcToSend / 10 ** TOKEN_DECIMALS,
        tx_signature: event.signature || sig,
        created_at: new Date().toISOString(),
      },
    ]);

    if (error) console.error("⚠️ Supabase insert error:", error.message);
    else console.log("🧾 Sale logged successfully to Supabase.");

    return res.status(200).json({ success: true, tx: sig });
  } catch (err) {
    console.error("❌ Airdrop error:", err);
    return res.status(500).json({ error: err.message });
  }
}
