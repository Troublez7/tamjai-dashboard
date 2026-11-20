import 'dotenv/config';
import express from 'express';
import {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ChannelType,
  Routes,
  AttachmentBuilder // [PAY]
} from 'discord.js';
import { REST } from '@discordjs/rest';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe'; // [PAY]
import { parseReport } from './parser.js';

// [PAY] เพิ่ม key ของ Stripe ในรายการที่ต้องมี
const required = [
  'DISCORD_BOT_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET'
];
for (const key of required) if (!process.env[key]) throw new Error(`Missing ${key} in .env`);

const BUCKET = 'screenshots';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY); // [PAY]

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message]
});

// รายการแพ็กเกจของร้าน Tamjai
const PACKAGES = {
  pkg_pearl_1k: { name: 'ฟาร์ม 1,000 Pearls', target: 1000, price: 50 },
  pkg_pearl_5k: { name: 'ฟาร์ม 5,000 Pearls', target: 5000, price: 230 },
  pkg_time_1d:  { name: 'เหมาฟาร์ม 1 วัน (24 ชม.)', target: 99999, price: 69 }
};

// --- ฟังก์ชันเดิมของ Tamjai ---
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

async function updateOrderProgress(worker, report) {
  if (!['victory', 'defeat'].includes(report.result) || report.pearls_session == null) return;
  const { data: orders, error } = await supabase.from('orders')
    .select('id, target, progress, last_session_value')
    .eq('worker_id', worker.id).eq('status', 'active')
    .order('created_at', { ascending: true });
  if (error || !orders?.length) return;

  const current = report.pearls_session;
  const last = orders[0].last_session_value;
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

// --- ฟังก์ชันสร้างแผงควบคุมในห้องงาน ---
function createControlPanel(orderCode, pkgName, target) {
  const embed = new EmbedBuilder()
    .setColor('#00E676')
    .setTitle(`🎮 ออเดอร์ [${orderCode}] - กำลังดำเนินการ`)
    .setDescription('ระบบฟาร์ม Macro กำลังดำเนินการ (ปลอดภัย 100% ไร้สคริปต์)')
    .addFields(
      { name: '📦 แพ็กเกจ', value: pkgName, inline: true },
      { name: '🎯 เป้าหมาย', value: `${target} หน่วย`, inline: true },
      { name: '📊 สถานะ', value: '🟢 ฟาร์มปกติ (Active)', inline: true },
      { name: '⏸️ สิทธิ์การพัก', value: 'โควตาพักได้ 3 ครั้ง (ไม่เกิน 24 ชม.)', inline: false }
    )
    .setFooter({ text: 'Tamjai Shop • Macro Auto-Farming' });

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`order_pause_${orderCode}`)
      .setLabel('พักฟาร์ม')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('⏸️'),
    new ButtonBuilder()
      .setCustomId(`order_screen_${orderCode}`)
      .setLabel('ดูจอเกม')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📸'),
    new ButtonBuilder()
      .setLabel('เช็กงานบนเว็บ')
      .setStyle(ButtonStyle.Link)
      .setURL('https://tamjai-dashboard.vercel.app')
      .setEmoji('🌐')
  );

  return { embeds: [embed], components: [buttons] };
}

// --- Express: health + [PAY] ตัวรับแจ้งยอดจาก Stripe ---
const app = express();
app.get('/health', (_req, res) => res.json({ ok: true }));

// [PAY] ต้องใช้ raw body เพื่อตรวจลายเซ็นของ Stripe
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    return res.status(400).send('bad signature');
  }

  try {
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      const code = pi.metadata?.order_code;

      if (code) {
        const { data: order } = await supabase.from('orders')
          .select('id, order_code, channel_id, package_name, target')
          .eq('order_code', code).maybeSingle();
        const pkg = Object.values(PACKAGES).find(p => p.name === order?.package_name);

        if (order && pkg && pi.currency === 'thb' && pi.amount === pkg.price * 100) {
          // เปลี่ยนได้ครั้งเดียว: ถ้า Stripe แจ้งซ้ำ จะไม่ถูกอัปเดตอีก
          const { data: updated } = await supabase.from('orders')
            .update({
              status: 'active',
              stripe_payment_intent_id: pi.id,
              paid_at: new Date().toISOString()
            })
            .eq('id', order.id)
            .eq('status', 'pending_payment')
            .select('id');

          if (updated?.length) {
            console.log(`💰 Paid: ${order.order_code}`);
            const ch = await client.channels.fetch(order.channel_id).catch(() => null);
                        if (ch) {
              // เอารูป QR เดิมออก เหลือข้อความยอดไว้
              const recent = await ch.messages.fetch({ limit: 20 }).catch(() => null);
              const qrMsg = recent?.find(m =>
                m.author.id === client.user.id &&
                m.attachments.some(a => a.name === `${order.order_code}.png`)
              );
              if (qrMsg) {
                await qrMsg.edit({ content: `${qrMsg.content}\n✅ ชำระแล้ว`, attachments: [] })
                  .catch(e => console.error('QR cleanup failed:', e.message));
              }

              const panel = createControlPanel(order.order_code, order.package_name, order.target);
              await ch.send({
                content: `✅ รับชำระแล้ว ${pkg.price} บาท เริ่มงานได้เลย`,
                embeds: panel.embeds,
                components: panel.components
              });
            }
          }
        } else {
          console.error('Stripe webhook: order/amount mismatch', code, pi.amount);
        }
      }
    }
    res.json({ received: true });
  } catch (e) {
    console.error('Stripe webhook error:', e.message);
    res.status(500).send('error'); // ให้ Stripe ลองส่งใหม่
  }
});

app.listen(Number(process.env.PORT || 3001), () => console.log('Health server ready'));

// --- ลงทะเบียนคำสั่งแบบเคลียร์ของเก่า ให้เหลืออันเดียว ---
async function registerSlashCommands() {
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
    const guildId = process.env.DISCORD_GUILD_ID;

    await rest.put(Routes.applicationCommands(client.user.id), { body: [] });

    if (guildId) {
      await rest.put(
        Routes.applicationGuildCommands(client.user.id, guildId),
        {
          body: [
            {
              name: 'setup-shop',
              description: 'สร้างแผงหน้าร้าน Tamjai สำหรับจ้างงาน'
            }
          ]
        }
      );
      console.log(`Successfully synced 1 command for Guild: ${guildId}`);
    }
  } catch (error) {
    console.error('Failed to register commands:', error.message);
  }
}

client.once('ready', async () => {
  console.log(`Tamjai Bot ready as ${client.user.tag}`);
  await registerSlashCommands();
});

// --- ดักจับ Interaction (คำสั่ง, เมนู, ปุ่ม) ---
client.on('interactionCreate', async (interaction) => {
  try {
    // 1. แอดมินพิมพ์ /setup-shop
    if (interaction.isChatInputCommand() && interaction.commandName === 'setup-shop') {
      const shopEmbed = new EmbedBuilder()
        .setColor('#FF6B00')
        .setTitle('🌾 ยินดีต้อนรับสู่ Tamjai Shop')
        .setDescription(
          'บริการฟาร์มเกมด้วยระบบ **Macro แท้ 100%** ไม่ฉีดสคริปต์ ปลอดภัย ไร้กังวลเรื่องโดนแบน\n\n' +
          '📌 **วิธีสั่งจ้างงาน:**\n' +
          '• เลือกแพ็กเกจที่ต้องการด้านล่างนี้ได้เลย\n' +
          '• บอทจะเปิดห้องส่วนตัว `#tj-xxxx` พร้อม QR พร้อมเพย์ให้ทันที'
        )
        .setFooter({ text: 'Tamjai Shop • Macro Auto-Farming' });

      const selectMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('select_tamjai_package')
          .setPlaceholder('🎯 เลือกบริการ / แพ็กเกจที่ต้องการ...')
          .addOptions([
            {
              label: 'ฟาร์ม 1,000 Pearls',
              description: 'ราคา 50 บาท (เป้าหมาย 1,000 Pearls)',
              value: 'pkg_pearl_1k',
              emoji: '💎'
            },
            {
              label: 'ฟาร์ม 5,000 Pearls',
              description: 'ราคา 230 บาท (เป้าหมาย 5,000 Pearls)',
              value: 'pkg_pearl_5k',
              emoji: '👑'
            },
            {
              label: 'เหมาฟาร์ม 1 วัน (24 ชม.)',
              description: 'ราคา 69 บาท (เล่นยาวๆ ทั้งวัน)',
              value: 'pkg_time_1d',
              emoji: '⏳'
            }
          ])
      );

      await interaction.reply({ content: 'สร้างแผงหน้าร้านเรียบร้อยแล้ว!', ephemeral: true });
      return interaction.channel.send({ embeds: [shopEmbed], components: [selectMenu] });
    }

    // 2. ลูกค้าเลือกแพ็กเกจจากเมนู
    if (interaction.isStringSelectMenu() && interaction.customId === 'select_tamjai_package') {
      await interaction.deferReply({ ephemeral: true });

      const selectedKey = interaction.values[0];
      const pkg = PACKAGES[selectedKey];
      if (!pkg) return interaction.editReply({ content: 'ไม่พบแพ็กเกจที่เลือก' });

      const orderCode = `TJ-${Math.floor(1000 + Math.random() * 9000)}`;

      // สร้างช่องตั๋วงานส่วนตัว
      const channel = await interaction.guild.channels.create({
        name: `tj-${orderCode.toLowerCase()}`,
        type: ChannelType.GuildText,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.AttachFiles
            ]
          }
        ]
      });

      // ค้นหา worker เครื่องแรกเพื่อผูก owner_id และ worker_id
      const { data: defaultWorker } = await supabase
        .from('workers')
        .select('id, owner_id')
        .eq('active', true)
        .limit(1)
        .maybeSingle();

      // [PAY] บันทึกออเดอร์เป็น pending_payment (ยังไม่เริ่มงานจนกว่าจะจ่ายเงิน)
      const insertPayload = {
        order_code: orderCode,
        customer_discord_id: interaction.user.id,
        channel_id: channel.id,
        package_name: pkg.name,
        target: pkg.target,
        progress: 0,
        status: 'pending_payment'
      };

      if (defaultWorker) {
        insertPayload.owner_id = defaultWorker.owner_id;
        insertPayload.worker_id = defaultWorker.id;
      }

      const { data: savedOrder, error: orderErr } = await supabase
        .from('orders')
        .insert(insertPayload)
        .select()
        .single();

      // [PAY] บันทึกไม่สำเร็จ = ไม่ส่ง QR ให้ลูกค้าโอน
      if (orderErr) {
        console.error('❌ Order insert error:', orderErr.message);
        await channel.delete().catch(() => {});
        return interaction.editReply({ content: '❌ สร้างออเดอร์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' });
      }
      console.log(`✅ Order ${orderCode} saved (ID: ${savedOrder?.id}) รอชำระเงิน`);

      // [PAY] สร้างรายการชำระเงิน PromptPay แล้วส่ง QR เข้าห้อง
      try {
        const payment = await stripe.paymentIntents.create({
          amount: pkg.price * 100,
          currency: 'thb',
          payment_method_data: {
            type: 'promptpay',
            billing_details: { email: 'tamjai-test@example.com' } // ใช้ค่าทดสอบ; ตอนรับเงินจริงให้เก็บอีเมลลูกค้า
          },
          confirm: true,
          return_url: 'https://tamjai-dashboard.vercel.app/',
          description: `Tamjai ${orderCode}`,
          metadata: { order_code: orderCode, discord_user_id: interaction.user.id }
        });

        const qr = payment.next_action?.promptpay_display_qr_code;
        if (!qr?.image_url_png) throw new Error('Stripe ไม่ส่ง QR กลับมา');

        await supabase.from('orders')
          .update({ stripe_payment_intent_id: payment.id })
          .eq('id', savedOrder.id);

        if (process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
          console.log('🧪 test pay page:', qr.hosted_instructions_url);
        }

        const img = await fetch(qr.image_url_png);
        if (!img.ok) throw new Error(`ดาวน์โหลดรูป QR ไม่สำเร็จ (${img.status})`);
        const file = new AttachmentBuilder(Buffer.from(await img.arrayBuffer()), { name: `${orderCode}.png` });

        await channel.send({
          content:
            `👋 <@${interaction.user.id}> ห้องออเดอร์ **${orderCode}**\n` +
            `📦 ${pkg.name}\n` +
            `💳 ยอดชำระ **${pkg.price} บาท** สแกนจ่ายด้วยพร้อมเพย์ ระบบจะแจ้งอัตโนมัติเมื่อรับเงินแล้ว`,
          files: [file],
          allowed_mentions: { users: [interaction.user.id] }
        });

        return interaction.editReply({ content: `✅ เปิดห้องงานของคุณแล้ว: <#${channel.id}>` });
      } catch (e) {
        console.error('❌ Payment create error:', e.message);
        await supabase.from('orders').update({ status: 'cancelled' }).eq('id', savedOrder.id);
        await channel.delete().catch(() => {});
        return interaction.editReply({ content: '❌ สร้างรายการชำระเงินไม่สำเร็จ กรุณาลองใหม่' });
      }
    }

    // 3. ปุ่มในการ์ดควบคุม
    if (interaction.isButton()) {
      const parts = interaction.customId.split('_');
      const actionType = parts[1]; // 'screen' หรือ 'pause'
      const orderCode = parts.slice(2).join('_');

      // --- ปุ่ม 📸 ดูจอเกม ---
      if (actionType === 'screen') {
        await interaction.deferReply({ ephemeral: false });
        console.log(`📸 Fetching screen for Order: [${orderCode}], Channel: [${interaction.channelId}]`);

        let order = null;
        const { data: orderData, error: orderErr } = await supabase
          .from('orders')
          .select('id, order_code, worker_id, progress, target')
          .or(`order_code.eq.${orderCode},channel_id.eq.${interaction.channelId}`)
          .maybeSingle();

        if (!orderErr && orderData) {
          order = orderData;
        }

        let reportQuery = supabase
          .from('match_reports')
          .select('screenshot_url, result, map_name, session_time, completion_time, pearls_session, created_at')
          .not('screenshot_url', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1);

        if (order?.worker_id) {
          reportQuery = reportQuery.eq('worker_id', order.worker_id);
        }

        const { data: reports } = await reportQuery;
        const latestReport = reports?.[0];

        if (!latestReport || !latestReport.screenshot_url) {
          return interaction.editReply({
            content: '⏳ ยังไม่พบภาพหน้าจอของเครื่องฟาร์ม (เครื่องอาจกำลังเริ่มรอบใหม่ กรุณารอสักครู่)'
          });
        }

        const displayCode = order?.order_code || orderCode;
        const screenEmbed = new EmbedBuilder()
          .setColor('#00C853')
          .setTitle(`📸 ภาพหน้าจอปัจจุบัน [${displayCode}]`)
          .setDescription('ดึงภาพจากเซสชันการฟาร์มล่าสุด')
          .addFields(
            { name: '🎯 ความคืบหน้า', value: `${order?.progress || 0} / ${order?.target || 0} Pearls`, inline: true },
            { name: '🎮 แมพ / ผลการเล่น', value: `${latestReport.map_name || 'N/A'} (${latestReport.result || 'Unknown'})`, inline: true },
            { name: '⏱️ เวลาในรอบ', value: `${latestReport.session_time || latestReport.completion_time || 'N/A'}`, inline: true }
          )
          .setImage(latestReport.screenshot_url)
          .setFooter({ text: 'Tamjai Screen Live • อัปเดตอัตโนมัติตามรอบฟาร์ม' })
          .setTimestamp(new Date(latestReport.created_at));

        return interaction.editReply({
          content: `ภาพหน้าจอล่าสุดของออเดอร์ **${displayCode}** มาแล้วครับ:`,
          embeds: [screenEmbed]
        });
      }

      // --- ปุ่ม ⏸️ พักฟาร์ม ---
      if (actionType === 'pause') {
        await interaction.reply({
          content: `⏸️ บันทึกคำขอพักงานออเดอร์ **${orderCode}** เรียบร้อยแล้ว`,
          ephemeral: false
        });
      }
    }

  } catch (err) {
    console.error('Interaction error:', err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'เกิดข้อผิดพลาดในการประมวลผล', ephemeral: true }).catch(() => {});
    }
  }
});

// --- ดักอ่านรีพอร์ตผลแมตช์ (โค้ดเดิม) ---
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