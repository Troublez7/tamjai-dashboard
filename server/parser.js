// Parser for Capy's AA Macro Discord embeds.
export function parseReport(message) {
  const embed = message.embeds?.[0];
  const fields = embed?.fields ?? [];
  const parts = [];
  if (message.content) parts.push(message.content);
  if (embed?.title) parts.push(embed.title);
  if (embed?.description) parts.push(embed.description);
  for (const field of fields) parts.push(`${field.name}: ${field.value}`);
  const rawText = parts.join('\n');

  const get = (regex) => rawText.match(regex)?.[1]?.trim() ?? null;
  const clean = (v) => (v && !/^(not available|n\/a|-+)$/i.test(v) ? v : null);

  // อ่านค่าจากฟิลด์โดยตรง: ตัด markdown, ช่องว่าง และ ':' ท้ายชื่อออกก่อนเทียบ
  const normalize = (s) => String(s ?? '').replace(/[*_`~]/g, '').replace(/[:\s]+$/g, '').trim().toLowerCase();
  const fieldValue = (...labels) => {
    const wanted = labels.map(normalize);
    const f = fields.find((x) => wanted.includes(normalize(x.name)));
    return f ? String(f.value ?? '').replace(/[*_`~]/g, '').trim() : null;
  };
  const timeOnly = (v) => {
  if (!v) return null;

  const value = String(v)
    .replace(/[*_`~]/g, '')
    .trim();

  return value || null;
};

  // Decide result from the title first, then fall back to the whole text.
  const title = `${message.content ?? ''}\n${embed?.title ?? ''}`;
  const classify = (text) => {
    if (/Macro Paused/i.test(text)) return 'paused';
    if (/Summer Rewards/i.test(text)) return 'rewards';
    if (/You Won|Victory/i.test(text)) return 'victory';
    if (/You Lost|Defeat/i.test(text)) return 'defeat';
    return null;
  };
  const result = classify(title) ?? classify(rawText) ?? 'unknown';

  const completion_time =
    timeOnly(clean(fieldValue('Total Time', 'Completion Time'))) ??
    timeOnly(clean(get(/(?:Total Time|Completion Time)[\s*:]*([^\n]+)/i)));

  const session_time =
    timeOnly(clean(fieldValue('Session Time'))) ??
    timeOnly(clean(get(/Session Time[\s*:]*([^\n]+)/i)));

  return {
    result,
    map_name: fieldValue('Map') ?? get(/(?:Map\s*\n|Map\s*:\s*)([^\n]+)/i),
    mode: fieldValue('Mode') ?? get(/(?:Mode\s*\n|Mode\s*:\s*)([^\n]+)/i),
    completion_time,
    session_time,
    wins_losses: clean(fieldValue('Wins / Losses', 'Wins/Losses') ?? get(/Wins\s*\/\s*Losses[\s*:]*([^\n]+)/i)),
    pearls_session: (() => {
      const v = get(/Summer Pearls\s*\(Session\)[\s:*]*([\d,]+)/i);
      return v ? Number(v.replace(/,/g, '')) : null;
    })(),
    raw_text: rawText,
    screenshot_url: embed?.image?.url ?? null,
    source_message_id: message.id,
    source_channel_id: message.channelId,
    source_guild_id: message.guildId ?? null,
    source_created_at: message.createdAt?.toISOString?.() ?? new Date().toISOString()
  };
}
