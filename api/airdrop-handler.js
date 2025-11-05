// /api/airdrop-handler.js
import { Connection, PublicKey, Transaction, Keypair } from "@solana/web3.js";
import { createTransferInstruction, getAssociatedTokenAddress } from "@solana/spl-token";

// === CONFIG ===
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const connection = new Connection(RPC_URL, "confirmed");

const ABC_MINT = new PublicKey("YOUR_ABC_MINT_ADDRESS"); // replace with actual
const PRESALE_WALLET = new PublicKey("GLbyyEP5AWMnVUvVikhH6LtRTyohFtBQBaTHMKpQBg9K");

// Load presale wallet secret key (stored as base58 array)
const secret = JSON.parse(process.env.PRESALE_SECRET_KEY);
const PRESALE_KEYPAIR = Keypair.fromSecretKey(Uint8Array.from(secret));

// === RATE LOGIC ===
const ABC_RATE = 700; // adjust dynamically if needed

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const event = req.body;
  console.log("🎯 Helius event:", JSON.stringify(event, null, 2));

  try {
    // Extract sender + amount
    const { fromUserAccount, account, amount, type } = event;

    // Only handle incoming transactions to your presale wallet
    if (account !== PRESALE_WALLET.toString()) return res.status(200).send("Not for this wallet");

    // Compute airdrop amount
    const abcAmount = Math.floor(amount * ABC_RATE * 1e6); // assuming 6 decimals

    // Create and send airdrop transaction
    const buyer = new PublicKey(fromUserAccount);
    const fromATA = await getAssociatedTokenAddress(ABC_MINT, PRESALE_WALLET);
    const toATA = await getAssociatedTokenAddress(ABC_MINT, buyer);

    const ix = createTransferInstruction(fromATA, toATA, PRESALE_WALLET, abcAmount);
    const tx = new Transaction().add(ix);
    tx.feePayer = PRESALE_WALLET.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    const sig = await connection.sendTransaction(tx, [PRESALE_KEYPAIR]);
    console.log("✅ Airdrop sent to", buyer.toBase58(), "Signature:", sig);

    return res.status(200).json({ success: true, sig });
  } catch (err) {
    console.error("❌ Airdrop failed:", err);
    return res.status(500).json({ error: err.message });
  }
}
