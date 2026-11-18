import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { createClient } from '@supabase/supabase-js';
import { parseReport } from './parser.js';

const required = ['DISCORD_BOT_TOKEN', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const key of required) if (!process.env[key]) throw new Error(`Missing ${key} in .env`);

const BUCKET = 'screenshots';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const app = express();
app.get('/health', (_req, res) => res.json({ ok: true }));
app.listen(Number(process.env.PORT || 3001), () => console.log('Health server ready'));

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel, Partials.Message]
});

// Download the Discord image and store it permanently in Supabase Storage.
// Falls back to the original Discord URL if anything goes wrong.
async function persistScreenshot(url, ownerId, messageId) {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed (${res.status})`);
    const contentType = res.headers.get('content-type') || 'image/png';
    const ext = contentType.includes('jpeg') ? 'jpg' : contentType.includes('webp') ? 'webp' : 'png';
    const buffer = Buffer.from(await res.arrayBuffer());
    const path = `${ownerId}/${messageId}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, buffer, {
      contentType,
      upsert: true
    });
    if (error) throw error;
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  } catch (error) {
    console.error('Screenshot upload failed, using Discord URL:', error.message);
    return url;
  }
}

// Add pearl progress to the worker's active order.
async function updateOrderProgress(worker, report) {
  if (!['victory', 'defeat'].includes(report.result) || report.pearls_session == null) return;
  const { data: orders, error } = await supabase.from('orders')
    .select('id, target, progress, last_session_value')
    .eq('worker_id', worker.id).eq('status', 'active')
    .order('created_at', { ascending: true });
  if (error || !orders?.length) return;

  const current = report.pearls_session;
  const last = orders[0].last_session_value;
  // ครั้งแรกตั้ง baseline ไม่บวก, ถ้ายอดลดลงแปลว่าเซสชันใหม่
  let remaining = last == null ? 0 : current >= last ? current - last : current;

  for (const o of orders) {
    const room = Number(o.target) - Number(o.progress);
    const add = Math.min(room, remaining);
    const progress = Number(o.progress) + add;
    remaining -= add;
    const done = progress >= Number(o.target);
    await supabase.from('orders').update({
      progress,
      last_session_value: current,
      ...(done ? { status: 'completed', completed_at: new Date().toISOString() } : {})
    }).eq('id', o.id);
    if (remaining <= 0) break;
  }
  console.log(`Order progress updated (+${current - (last ?? current)})`);
}

client.once('clientReady', () => console.log(`Discord reader ready as ${client.user.tag}`));
client.on('messageCreate', async (message) => {
  try {
    if (message.author?.bot && !message.webhookId) return;
    const { data: worker, error: workerError } = await supabase
      .from('workers').select('id, owner_id, name, active')
      .eq('discord_channel_id', message.channelId).eq('active', true).maybeSingle();
    if (workerError) throw workerError;
    if (!worker) return;
    if (!message.content && message.embeds.length === 0) return;

    const report = parseReport(message);
    const screenshotUrl = await persistScreenshot(report.screenshot_url, worker.owner_id, report.source_message_id);

    const { error } = await supabase.from('match_reports').upsert({
      worker_id: worker.id,
      owner_id: worker.owner_id,
      result: report.result,
      map_name: report.map_name,
      mode: report.mode,
      completion_time: report.completion_time,
      session_time: report.session_time,
      wins_losses: report.wins_losses,
      pearls_session: report.pearls_session,
      raw_text: report.raw_text,
      screenshot_url: screenshotUrl,
      source_message_id: report.source_message_id,
      source_channel_id: report.source_channel_id,
      source_guild_id: report.source_guild_id,
      source_created_at: report.source_created_at
    }, { onConflict: 'source_message_id' });
    if (error) throw error;

    await updateOrderProgress(worker, report);
    console.log(`Saved report from worker ${worker.name}: ${report.result}`);
  } catch (error) {
    console.error('Could not process Discord report:', error.message);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);