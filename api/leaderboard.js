// /api/leaderboard.js — Vercel Serverless (Node 18+)
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ORIGIN = process.env.ALLOW_ORIGIN || 'https://abielcryptocoin.com';
const TARGET_LAT = parseFloat(process.env.TARGET_LAT || '0');
const TARGET_LNG = parseFloat(process.env.TARGET_LNG || '0');
const TARGET_SALT = process.env.TARGET_SALT || 'change-me';

function cors(res){
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function maskEmail(email){
  const [u, d] = (email || '').split('@');
  if(!u || !d) return '—';
  const u2 = u.length <= 2 ? u[0]+'*' : u[0] + '***' + u[u.length-1];
  const dom = d.split('.');
  const dd = dom[0].length <= 2 ? dom[0][0]+'*' : dom[0][0] + '***' + dom[0][dom[0].length-1];
  return `${u2}@${dd}.${dom.slice(1).join('.')}`;
}

export default async function handler(req, res){
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({error:'Method not allowed'});
  try {
    const top = Math.max(1, Math.min(100, parseInt(req.query.top || '10', 10)));
    const { data, error } = await supabase.from('guesses')
      .select('email, distance_km')
      .order('distance_km', { ascending: true })
      .limit(top);
    if (error) throw error;
    const topRows = (data || []).map((r, i) => ({
      rank: i+1,
      emailMasked: maskEmail(r.email),
      distanceKm: r.distance_km
    }));
    const commitmentHash = crypto.createHash('sha256')
      .update(`${TARGET_LAT},${TARGET_LNG}:${TARGET_SALT}`)
      .digest('hex');
    return res.status(200).json({ top: topRows, commitmentHash });
  } catch (e){
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
}
