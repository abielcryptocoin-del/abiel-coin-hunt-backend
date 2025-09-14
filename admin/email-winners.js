// admin/email-winners.js — run locally (node) after the contest closes
// Sends emails to top 10 using Resend. Requires env vars set in a .env file.
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

async function main(){
  const { data, error } = await supabase.from('guesses')
    .select('email, name, distance_km')
    .order('distance_km', { ascending: true })
    .limit(10);
  if (error) throw error;

  for (let i=0; i<data.length; i++){
    const r = data[i];
    const rank = i+1;
    const name = r.name || 'Explorer';
    const email = r.email;
    await resend.emails.send({
      from: process.env.FROM_EMAIL, // e.g. "Alex from Abiel <alexander@abielcryptocoin.com>"
      to: email,
      subject: `🎉 You placed #${rank} in AbielCryptoCoin’s Coin Hunt!`,
      html: `<p>Hi ${name},</p>
        <p>Congratulations! You placed <b>#${rank}</b> with a distance of <b>${r.distance_km} km</b> from the secret location.</p>
        <p>Please reply with your preferred wallet address to receive your prize.</p>
        <p>— Alexander & the AbielCryptoCoin team</p>`
    });
    console.log('Sent to', email);
  }
  console.log('All winner emails sent.');
}

main().catch(e => { console.error(e); process.exit(1); });
