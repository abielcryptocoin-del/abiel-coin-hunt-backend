// /api/airdrop-handler.js
import { Connection, PublicKey, Transaction, Keypair } from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
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
// ABC token decimals (set to your mint's actual decimals)
const TOKEN_DECIMALS = 6; // if ABC mint uses 9, change this to 9

// Presale schedule (UTC, inclusive end times) — NEW 2-day 750 window then 700, etc.
const PHASES = [
  { start: "2025-11-08T00:00:00Z", end: "2025-11-10T23:59:59.999Z", rate: 750 }, // 08.11 → 10.11
  { start: "2025-11-11T00:00:00Z", end: "2025-11-27T23:59:59.999Z", rate: 700 }, // 11.11 → 28.11
  { start: "2025-11-28T00:00:00Z", end: "2025-12-04T23:59:59.999Z", rate: 650 }, // 28.11 → 05.12
  { start: "2025-12-05T00:00:00Z", end: "2025-12-11T23:59:59.999Z", rate: 600 }, // 05.12 → 12.12
  { start: "2025-12-12T00:00:00Z", end: "2025-12-18T23:59:59.999Z", rate: 550 }, // 12.12 → 19.12
  { start: "2025-12-19T00:00:00Z", end: "2025-12-25T23:59:59.999Z", rate: 500 }, // 19.12 → 26.12
  { start: "2025-12-26T00:00:00Z", end: "2026-01-01T23:59:59.999Z", rate: 450 }, // 26.12 → 02.01
  { start: "2026-01-02T00:00:00Z", end: "2026-01-08T23:59:59.999Z", rate: 400 }, // 02.01 → 09.01
  { start: "2026-01-09T00:00:00Z", end: "2026-01-15T23:59:59.999Z", rate: 350 }, // 09.01 → 16.01
  { start: "2026-01-16T00:00:00Z", end: "2026-01-22T23:59:59.999Z", rate: 300 }, // 16.01 → 23.01
  { start: "2026-01-23T00:00:00Z", end: "2026-01-29T23:59:59.999Z", rate: 250 }, // 23.01 → 30.01
  { start: "2026-01-30T00:00:00Z", end: "2026-02-05T23:59:59.999Z", rate: 200 }, // 30.01 → 06.02
  { start: "2026-02-06T00:00:00Z", end: "2026-02-13T23:59:59.999Z", rate: 150 }, // 06.02 → 14.02
];
const LAUNCH_DATE = "2026-02-14T00:00:00Z";
const LAUNCH_RATE = 75;

// Helper: select the phase rate for a given time (inclusive ends)
function getRateAt(isoOrDate) {
  const t = new Date(isoOrDate);
  if (t >= new Date(LAUNCH_DATE)) return LAUNCH_RATE;
  for (const p of PHASES) {
    const s = new Date(p.start), e = new Date(p.end);
    if (t >= s && t <= e) return p.rate;
  }
  // Before schedule starts → first rate; after last phase but pre-launch → last phase rate
  if (t < new Date(PHASES[0].start)) return PHASES[0].rate;
  return PHASES[PHASES.length - 1].rate;
}

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

    // Derive an authoritative timestamp from the webhook for phase selection
    const txMs =
      (typeof event?.timestamp === "number" ? (event.timestamp < 1e12 ? event.timestamp * 1000 : event.timestamp) : null) ??
      (typeof event?.blockTime === "number" ? (event.blockTime * 1000) : null) ??
      Date.now();
    const when = new Date(txMs);
    const RATE_ABC_PER_USDC = getRateAt(when);
    console.log(`🕒 Using ${RATE_ABC_PER_USDC} ABC/USDC for time ${when.toISOString()}`);

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
      abcToSend = Math.floor(usdValue * RATE_ABC_PER_USDC * 10 ** TOKEN_DECIMALS);

      console.log(`💵 ${amount} SOL ≈ ${usdValue.toFixed(2)} USD → ${abcToSend / 10 ** TOKEN_DECIMALS} ABC`);
    }

    // === Detect USDC payment ===
    const usdcTx = tokenTransfers.find(
      (t) => t.toUserAccount === PRESALE_COLLECTION_WALLET.toString()
    );
    if (usdcTx) {
      buyer = usdcTx.fromUserAccount;
      amount = Number(usdcTx.tokenAmount) / 1e6; // robust if tokenAmount is a string
      
      abcToSend = Math.floor(amount * RATE_ABC_PER_USDC * 10 ** TOKEN_DECIMALS);      
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

    const tx = new Transaction();

    try {
      await getAccount(connection, fromATA);
    } catch {
      tx.add(createAssociatedTokenAccountInstruction(
        AIRDROP_SOURCE_WALLET,
        fromATA,
        AIRDROP_SOURCE_WALLET,
        ABC_MINT
      ));
    }
    
    try {
      // If this throws, the buyer's ABC ATA doesn't exist yet
      await getAccount(connection, toATA);
    } catch {
      // Create buyer's ATA (payer = AIRDROP_SOURCE_WALLET)
      tx.add(createAssociatedTokenAccountInstruction(
        AIRDROP_SOURCE_WALLET, // payer covering rent
        toATA,                 // ATA to create
        buyerPubkey,           // ATA owner
        ABC_MINT               // mint
      ));
    }
    // Now safe to transfer ABC
    tx.add(createTransferInstruction(fromATA, toATA, AIRDROP_SOURCE_WALLET, abcToSend));
    
    tx.feePayer = AIRDROP_SOURCE_WALLET;
    tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    // === Send ===
    const sig = await connection.sendTransaction(tx, [AIRDROP_KEYPAIR]);
    console.log(`✅ Airdrop sent: https://solscan.io/tx/${sig}`);

    // === Log to Supabase ===
    const isSOL = Boolean(solTx);
    const { error } = await supabase.from("presale_logs").insert([
      {
        buyer,
        sol_amount: isSOL ? amount : null,
        usdc_amount: !isSOL ? amount : null,
        abc_amount: abcToSend / 10 ** TOKEN_DECIMALS,
        used_rate: RATE_ABC_PER_USDC,
        at_time_iso: when.toISOString(),
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
