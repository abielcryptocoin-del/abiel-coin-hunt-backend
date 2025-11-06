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

console.log("🚀 Running UPDATED airdrop-handler v3.1");

// === CONFIG ===
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const connection = new Connection(RPC_URL, "confirmed");

// ABC mint + wallet setup
const ABC_MINT = new PublicKey("7YESrv9LkAhAQH2kkvbDGjmgnJ94FTFapDQqR6YWUtFc");
const PRESALE_COLLECTION_WALLET = new PublicKey("GLbyyEP5AWMnVUvVikhH6LtRTyohFtBQBaTHMKpQBg9K"); // where buyers send SOL
const AIRDROP_SOURCE_WALLET = new PublicKey("GdguGxvuYJQuMkNWswLATrqryW6PqwerwwEUYFmXmi67"); // holds 100M ABC

// Load the source wallet private key
const secret = JSON.parse(process.env.AIRDROP_SECRET_KEY); // MUST correspond to GdguGx...
const AIRDROP_KEYPAIR = Keypair.fromSecretKey(Uint8Array.from(secret));

// === SETTINGS ===
const ABC_RATE = 700; // 1 SOL = 700 ABC
const TOKEN_DECIMALS = 6; // ABC has 6 decimals

// === MAIN HANDLER ===
export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ message: "Only POST allowed" });

  try {
    console.log("🎯 Webhook event received:", JSON.stringify(req.body, null, 2));
    const event = req.body[0];

    // 1️⃣ Detect incoming SOL/USDC payments to your presale wallet
    const nativeTransfers = event.nativeTransfers || [];
    const tokenTransfers = event.tokenTransfers || [];

    let buyer = null;
    let amount = 0;

    // SOL transfer
    const solTx = nativeTransfers.find(
      (t) => t.toUserAccount === PRESALE_COLLECTION_WALLET.toString()
    );
    if (solTx) {
      buyer = solTx.fromUserAccount;
      amount = solTx.amount / 1e9; // lamports → SOL
    }

    // USDC transfer (optional)
    const usdcTx = tokenTransfers.find(
      (t) => t.toUserAccount === PRESALE_COLLECTION_WALLET.toString()
    );
    if (usdcTx) {
      buyer = usdcTx.fromUserAccount;
      amount = usdcTx.tokenAmount / 1e6; // USDC has 6 decimals
    }

    if (!buyer || amount <= 0) {
      console.log("⚠️ No valid incoming payment, skipping.");
      return res.status(200).json({ ignored: true });
    }

    console.log(`💰 Buyer ${buyer} paid ${amount} (SOL/USDC)`);

    // 2️⃣ Calculate ABC tokens to send
    const abcToSend = Math.floor(amount * ABC_RATE * 10 ** TOKEN_DECIMALS);
    console.log(`🎁 Preparing to send ${abcToSend / 10 ** TOKEN_DECIMALS} ABC`);

    // 3️⃣ Prepare transfer
    const buyerPubkey = new PublicKey(buyer);
    const fromATA = await getAssociatedTokenAddress(
      ABC_MINT,
      AIRDROP_SOURCE_WALLET
    );

    // Create destination token account if needed
    const toATAAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      AIRDROP_KEYPAIR,
      ABC_MINT,
      buyerPubkey
    );
    const toATA = toATAAccount.address;

    const ix = createTransferInstruction(
      fromATA,
      toATA,
      AIRDROP_SOURCE_WALLET,
      abcToSend
    );

    const tx = new Transaction().add(ix);

    // 4️⃣ Send and confirm
    const sig = await sendAndConfirmTransaction(connection, tx, [AIRDROP_KEYPAIR]);
    console.log(`✅ Airdrop sent: https://solscan.io/tx/${sig}`);

    return res.status(200).json({ success: true, tx: sig });
  } catch (err) {
    console.error("❌ Airdrop error:", err);
    return res.status(500).json({ error: err.message });
  }
}
