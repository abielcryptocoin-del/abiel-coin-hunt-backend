// /api/airdrop-handler.js
import { Connection, PublicKey, Keypair, Transaction } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
} from "@solana/spl-token";

// === CONFIG ===
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const connection = new Connection(RPC_URL, "confirmed");

// Replace with your actual ABC mint address
const ABC_MINT = new PublicKey("YOUR_ABC_MINT_ADDRESS");
const PRESALE_WALLET = new PublicKey(
  "GLbyyEP5AWMnVUvVikhH6LtRTyohFtBQBaTHMKpQBg9K"
);

// Load presale wallet private key from environment (base58 JSON array)
const secret = JSON.parse(process.env.PRESALE_SECRET_KEY);
const PRESALE_KEYPAIR = Keypair.fromSecretKey(Uint8Array.from(secret));

const ABC_RATE = 700; // adjust dynamically if needed

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ message: "Only POST allowed" });

  try {
    const body = req.body;
    console.log("🎯 Helius event received:", JSON.stringify(body, null, 2));

    // --- Extract buyer + amount ---
    const tx = body[0];
    if (!tx || !tx.description?.includes("Transfer")) {
      return res.status(200).json({ message: "No valid transfer event" });
    }

    // Example: detect SOL or USDC sent to your presale wallet
    const accountData = tx.accountData || [];
    const presaleAcc = PRESALE_WALLET.toString();

    const incoming = accountData.find(
      (a) => a.owner === presaleAcc || a.account === presaleAcc
    );
    if (!incoming) {
      return res.status(200).json({ message: "Not for presale wallet" });
    }

    const buyerAddress = tx.source || tx.feePayer;
    if (!buyerAddress) {
      return res.status(200).json({ message: "No buyer detected" });
    }

    // amount in SOL or USDC — placeholder (you’ll adapt later)
    const amountPaid = tx.amount || 1; // fallback 1 USDC

    // --- Calculate airdrop ---
    const airdropAmount = amountPaid * ABC_RATE * 1e6; // assuming 6 decimals

    console.log(
      `💸 Detected presale from ${buyerAddress}, sending ${airdropAmount /
        1e6} ABC`
    );

    // --- SPL Transfer ---
    const buyer = new PublicKey(buyerAddress);
    const fromATA = await getAssociatedTokenAddress(ABC_MINT, PRESALE_WALLET);
    const toATA = await getAssociatedTokenAddress(ABC_MINT, buyer);

    const ix = createTransferInstruction(
      fromATA,
      toATA,
      PRESALE_WALLET,
      airdropAmount
    );

    const txAirdrop = new Transaction().add(ix);
    txAirdrop.feePayer = PRESALE_WALLET.publicKey;
    txAirdrop.recentBlockhash = (
      await connection.getLatestBlockhash()
    ).blockhash;

    const sig = await connection.sendTransaction(txAirdrop, [PRESALE_KEYPAIR]);
    console.log("✅ Airdrop sent! Signature:", sig);

    return res.status(200).json({ success: true, signature: sig });
  } catch (err) {
    console.error("❌ Handler error:", err);
    return res.status(500).json({ error: err.message });
  }
}
