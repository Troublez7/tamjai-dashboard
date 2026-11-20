import 'dotenv/config';
import Stripe from 'stripe';
import { REST, Routes } from 'discord.js';

async function main() {
  const channelId = process.argv[2];
  const key = process.env.STRIPE_SECRET_KEY;
  const token = process.env.DISCORD_BOT_TOKEN;

  if (!/^\d{17,20}$/.test(channelId ?? '')) {
    throw new Error('ใส่ Channel ID ต่อท้ายคำสั่ง เช่น node test-promptpay.mjs 123456789012345678');
  }
  if (!key?.startsWith('sk_test_')) {
    throw new Error('หยุดทดสอบ: ต้องใช้ STRIPE_SECRET_KEY ที่ขึ้นต้นด้วย sk_test_ เท่านั้น');
  }
  if (!token) throw new Error('ไม่พบ DISCORD_BOT_TOKEN ใน .env');

  const stripe = new Stripe(key);
  const discord = new REST({ version: '10' }).setToken(token);

  const payment = await stripe.paymentIntents.create({
    amount: 5000, // 5,000 สตางค์ = 50 บาท
    currency: 'thb',
    payment_method_data: {
      type: 'promptpay',
      billing_details: { email: 'tamjai-test@example.com' }
    },
    confirm: true,
    return_url: 'https://tamjai-dashboard.vercel.app/',
    description: 'Tamjai Discord QR test',
    metadata: { purpose: 'discord_sandbox_test' }
  });

  const qrUrl = payment.next_action?.promptpay_display_qr_code?.image_url_png;
  if (!qrUrl) {
    throw new Error(`Stripe ไม่ได้ส่งรูป QR กลับมา (สถานะ: ${payment.status})`);
  }

  const image = await fetch(qrUrl);
  if (!image.ok) throw new Error(`ดาวน์โหลดรูป QR ไม่สำเร็จ (${image.status})`);

  await discord.post(Routes.channelMessages(channelId), {
    body: {
      content: '🧪 **ทดสอบพร้อมเพย์ · 50 บาท**\nนี่คือ QR จาก Sandbox ไม่ใช่บิลจริง กรุณาอย่าโอนเงิน',
      allowed_mentions: { parse: [] }
    },
    files: [{
      name: 'tamjai-test-50-thb.png',
      data: Buffer.from(await image.arrayBuffer())
    }]
  });

  console.log('✅ ส่ง QR ทดสอบเข้าห้อง Discord แล้ว');
}

main().catch((err) => {
  console.error('❌', err.code ?? '', err.message);
  process.exitCode = 1;
});
