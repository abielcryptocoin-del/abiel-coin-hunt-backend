// /api/submit.js — Vercel Serverless (Node 18+)
// Persists guesses and keeps the best (smallest distance) per email.
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ORIGIN = process.env.ALLOW_ORIGIN || 'https://abielcryptocoin.com';
const TARGET_LAT = parseFloat(process.env.TARGET_LAT || '0');
const TARGET_LNG = parseFloat(process.env.TARGET_LNG || '0');

function cors(res){
  res.setHeader('Access-Control-Allow-Origin', ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
function haversine(lat1, lon1, lat2, lon2){
  const R = 6371;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function emailOk(e){ return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e || ''); }

export default async function handler(req, res){
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});

  try {
    const { name='', email='', lat, lng, website='' } = req.body || {};
    if (website) return res.status(200).json({ ok:true }); // honeypot trip: pretend success
    if (!emailOk(email)) return res.status(400).json({ error: 'Invalid email' });
    const la = parseFloat(lat), lo = parseFloat(lng);
    if (!Number.isFinite(la) || !Number.isFinite(lo) || la<-90 || la>90 || lo<-180 || lo>180){
      return res.status(400).json({error:'Invalid coordinates'});
    }

    const distance_km = Math.round(haversine(la, lo, TARGET_LAT, TARGET_LNG) * 1000) / 1000;

    // Upsert by email (case-insensitive)
    const email_lc = email.trim().toLowerCase();
    const { data: existing, error: selErr } = await supabase
      .from('guesses')
      .select('*').eq('email_lc', email_lc).maybeSingle();
    if (selErr) throw selErr;

    if (!existing){
      const { error: insErr } = await supabase.from('guesses').insert({
        email, email_lc, name, lat: la, lng: lo, distance_km
      });
      if (insErr) throw insErr;
    } else {
      if (distance_km < existing.distance_km){
        const { error: updErr } = await supabase.from('guesses')
          .update({ name, lat: la, lng: lo, distance_km, updated_at: new Date().toISOString() })
          .eq('email_lc', email_lc);
        if (updErr) throw updErr;
      }
    }

    return res.status(200).json({ ok:true });
  } catch (e){
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
}
