// /api/airdrop-handler.js
import { Connection, PublicKey, Transaction, Keypair } from "@solana/web3.js";
import { getAssociatedTokenAddress, createTransferInstruction } from "@solana/spl-token";

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const connection = new Connection(RPC_URL, "confirmed");

// === CONFIG ===
const ABC_MINT = new PublicKey("7YESrv9LkAhAQH2kkvbDGjmgnJ94FTFapDQqR6YWUtFc");
const PRESALE_COLLECTION_WALLET = new PublicKey("GLbyyEP5AWMnVUvVikhH6LtRTyohFtBQBaTHMKpQBg9K");
const AIRDROP_SOURCE_WALLET = new PublicKey("GdguGxvuYJQuMkNWswLATrqryW6PqwerwwEUYFmXmi67");

// Load the presale distribution wallet’s private key
const secret = JSON.parse(process.env.PRESALE_SECRET_KEY);
const AIRDROP_KEYPAIR = Keypair.fromSecretKey(Uint8Array.from(secret));

// === SETTINGS ===
const ABC_RATE = 700; // 1 USDC = 700 ABC equivalent
const TOKEN_DECIMALS = 6;

// === MAIN HANDLER ===
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ message: "Only POST allowed" });

  try {
    console.log("🎯 Webhook event received:", JSON.stringify(req.body, null, 2));
    const event = req.body[0];

    // 1️⃣ Detect SOL or USDC incoming to your presale collection wallet
    const nativeTransfers = event.nativeTransfers || [];
    const tokenTransfers = event.tokenTransfers || [];

    let buyer = null;
    let amount = 0;

    // If it's a SOL transfer
    const solTx = nativeTransfers.find(t => t.toUserAccount === PRESALE_COLLECTION_WALLET.toString());
    if (solTx) {
      buyer = solTx.fromUserAccount;
      amount = solTx.amount / 1e9; // convert lamports → SOL
    }

    // If it's a USDC transfer
    const usdcTx = tokenTransfers.find(t => t.toUserAccount === PRESALE_COLLECTION_WALLET.toString());
    if (usdcTx) {
      buyer = usdcTx.fromUserAccount;
      amount = usdcTx.tokenAmount / 1e6; // convert to USDC units
    }

    if (!buyer || amount <= 0) {
      console.log("⚠️ No valid transfer found, skipping.");
      return res.status(200).json({ ignored: true });
    }

    console.log(`💵 Buyer ${buyer} paid ${amount} (SOL/USDC)`);

    // 2️⃣ Calculate how many ABC to send
    const abcToSend = Math.floor(amount * ABC_RATE * 10 ** TOKEN_DECIMALS);
    console.log(`🎁 Sending ${abcToSend / 10 ** TOKEN_DECIMALS} ABC`);

    // 3️⃣ Prepare transfer transaction
    const buyerPubkey = new PublicKey(buyer);
    const fromATA = await getAssociatedTokenAddress(ABC_MINT, AIRDROP_SOURCE_WALLET);
    const toATA = await getAssociatedTokenAddress(ABC_MINT, buyerPubkey);

    const ix = createTransferInstruction(fromATA, toATA, AIRDROP_SOURCE_WALLET, abcToSend);
    const tx = new Transaction().add(ix);
    tx.feePayer = AIRDROP_SOURCE_WALLET;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    // 4️⃣ Sign and send
    const sig = await connection.sendTransaction(tx, [AIRDROP_KEYPAIR]);
    console.log(`✅ Airdrop sent: https://solscan.io/tx/${sig}`);

    return res.status(200).json({ success: true, tx: sig });
  } catch (err) {
    console.error("❌ Airdrop error:", err);
    return res.status(500).json({ error: err.message });
  }
}
