// /api/airdrop-handler.js
import { Connection, PublicKey, Transaction, Keypair } from "@solana/web3.js";
import {
  createTransferInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

// === CONFIG ===
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const connection = new Connection(RPC_URL, "confirmed");

const ABC_MINT = new PublicKey("7YESrv9LkAhAQH2kkvbDGjmgnJ94FTFapDQqR6YWUtFc");
const PRESALE_WALLET = new PublicKey("GLbyyEP5AWMnVUvVikhH6LtRTyohFtBQBaTHMKpQBg9K");

// Load presale wallet secret key (from Vercel Environment Variables)
const secret = JSON.parse(process.env.PRESALE_SECRET_KEY);
const PRESALE_KEYPAIR = Keypair.fromSecretKey(Uint8Array.from(secret));

// === RATE LOGIC ===
const ABC_RATE = 700; // 1 USDC = 700 ABC

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const event = req.body;
  console.log("🎯 Webhook event received:", JSON.stringify(event, null, 2));

  try {
    // Extract and verify target wallet
    const instructions = event[0]?.instructions || [];
    const transferIx = instructions.find(ix =>
      ix.parsed?.info?.destination === PRESALE_WALLET.toString()
    );

    if (!transferIx) {
      console.log("❌ No transfer to presale wallet detected.");
      return res.status(200).send("Not for presale wallet");
    }

    const buyerAddress = transferIx.parsed?.info?.source;
    const amount = Number(transferIx.parsed?.info?.lamports || 0) / 1e9; // SOL

    if (!buyerAddress || amount <= 0) {
      console.log("⚠️ Invalid or missing buyer info.");
      return res.status(200).send("Invalid transaction");
    }

    // Calculate ABC airdrop amount
    const abcAmount = Math.floor(amount * ABC_RATE * 1e6); // 6 decimals
    console.log(`💰 Airdropping ${abcAmount / 1e6} ABC to ${buyerAddress}`);

    const buyerPubkey = new PublicKey(buyerAddress);
    const fromATA = await getAssociatedTokenAddress(
      ABC_MINT,
      PRESALE_WALLET,
      true
    );
    const toATA = await getAssociatedTokenAddress(ABC_MINT, buyerPubkey, true);

    const ix = createTransferInstruction(
      fromATA,
      toATA,
      PRESALE_WALLET,
      abcAmount,
      [],
      TOKEN_PROGRAM_ID
    );

    const tx = new Transaction().add(ix);
    tx.feePayer = PRESALE_WALLET;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    const sig = await connection.sendTransaction(tx, [PRESALE_KEYPAIR]);
    console.log(`✅ Airdrop sent! https://solscan.io/tx/${sig}`);
    return res.status(200).json({ success: true, sig });
  } catch (err) {
    console.error("❌ Airdrop failed:", err);
    return res.status(500).json({ error: err.message });
  }
}
