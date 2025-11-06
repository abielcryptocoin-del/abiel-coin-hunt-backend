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

console.log("🚀 airdrop-handler v4.3 — debug-safe rollback");

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const connection = new Connection(RPC_URL, "confirmed");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// === CONFIG ===
const ABC_MINT = new PublicKey("7YESrv9LkAhAQH2kkvbDGjmgnJ94FTFapDQqR6YWUtFc");
const PRESALE_COLLECTION_WALLET = new PublicKey("GdguGxvuYJQuMkNWswLATrqryW6PqwerwwEUYFmXmi67"); // treasury (receiver)
const AIRDROP_SOURCE_WALLET = new PublicKey("GLbyyEP5AWMnVUvVikhH6LtRTyohFtBQBaTHMKpQBg9K");   // presale (sender)

const secret = JSON.parse(process.env.AIRDROP_SECRET_KEY);
const AIRDROP_KEYPAIR = Keypair.fromSecretKey(Uint8Array.from(secret));

const ABC_RATE_USDC = 700;
const TOKEN_DECIMALS = 6;

async function getSolPriceUSD() {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
    );
    const data = await res.json();
    return data.solana?.usd || 0;
  } catch {
    return 0;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ message: "Only POST allowed" });

  try {
    const event = req.body[0];
    if (!event) return res.status(400).json({ error: "Invalid payload" });

    console.log("🧠 FULL EVENT:", JSON.stringify(event, null, 2));

    const txSignature = event.signature;
    const nativeTransfers = event.nativeTransfers || [];
    const tokenTransfers = event.tokenTransfers || [];

    // Pick the first native transfer (no strict filtering yet)
    const solTx = nativeTransfers[0];
    let buyer = null;
    let amount = 0;
    let abcToSend = 0;

    if (solTx) {
      buyer =
        solTx.fromUserAccount ||
        solTx.fromAccount ||
        solTx.fromUser ||
        solTx.from ||
        solTx.source ||
        null;

      amount = solTx.amount / 1e9; // lamports → SOL
      const solPriceUSD = await getSolPriceUSD();
      abcToSend = Math.floor(
        amount * solPriceUSD * ABC_RATE_USDC * 10 ** TOKEN_DECIMALS
      );

      console.log(`💰 Buyer ${buyer} paid ${amount} SOL`);
      console.log(`💲 SOL/USD: ${solPriceUSD}, sending ${abcToSend / 1e6} ABC`);
    } else if (tokenTransfers.length) {
      const usdcTx = tokenTransfers[0];
      buyer =
        usdcTx.fromUserAccount ||
        usdcTx.fromAccount ||
        usdcTx.fromUser ||
        usdcTx.source ||
        null;
      amount = usdcTx.tokenAmount / 1e6;
      abcToSend = Math.floor(amount * ABC_RATE_USDC * 10 ** TOKEN_DECIMALS);
      console.log(`💰 Buyer ${buyer} paid ${amount} USDC`);
    }

    if (!buyer) {
      console.log("⚠️ Buyer not detected — no transfer found");
      return res.status(200).json({ ignored: true });
    }

    // === Transfer ABC ===
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
    console.log(`✅ ABC sent: https://solscan.io/tx/${sig}`);

    // === Log sale ===
    const { error: dbError } = await supabase.from("presale_logs").insert([
      {
        buyer,
        sol_amount: amount,
        abc_amount: abcToSend / 1e6,
        tx_signature: txSignature || sig
      }
    ]);
    if (dbError) console.error("⚠️ Supabase error:", dbError.message);
    else console.log("🧾 Sale logged in Supabase");

    return res.status(200).json({ success: true, tx: sig });
  } catch (err) {
    console.error("❌ Handler error:", err);
    return res.status(500).json({ error: err.message });
  }
}
