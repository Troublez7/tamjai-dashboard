'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
// @ts-ignore
import generatePayload from 'promptpay-qr';
import type { User } from '@supabase/supabase-js';
import { supabaseBrowser } from '../../lib/supabase';

type Product = { id: string; name: string; target: number; price_thb: number };
type Order = { id: string; target: number };

const supabase = supabaseBrowser();
const PROMPTPAY_ID = process.env.NEXT_PUBLIC_PROMPTPAY_ID ?? '';

export default function Shop() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [picked, setPicked] = useState<Product | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [qr, setQr] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { setUser(data.user); setLoading(false); });
    supabase.from('products').select('id,name,target,price_thb').eq('active', true).order('price_thb')
      .then(({ data }) => setProducts((data ?? []) as Product[]));
  }, []);

  async function buy(p: Product) {
    setBusy(true); setNotice('');
    const { data, error } = await supabase.rpc('create_order', { p_product_id: p.id });
    if (error) { setNotice(error.message); setBusy(false); return; }
    setPicked(p);
    setOrder(data as Order);
    if (PROMPTPAY_ID) {
      const payload = generatePayload(PROMPTPAY_ID, { amount: Number(p.price_thb) });
      setQr(await QRCode.toDataURL(payload, { width: 300, margin: 1 }));
    }
    setBusy(false);
  }

  async function sendSlip() {
    if (!file || !order || !user) return;
    setBusy(true); setNotice('');
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    const path = `${user.id}/${order.id}.${ext}`;
    const up = await supabase.storage.from('slips').upload(path, file, { upsert: true });
    if (up.error) { setNotice(up.error.message); setBusy(false); return; }
    const { error } = await supabase.rpc('attach_slip', { p_order_id: order.id, p_path: path });
    if (error) setNotice(error.message); else setDone(true);
    setBusy(false);
  }

  if (loading) return <main className="wrap">กำลังโหลด...</main>;
  if (!user) return (
    <main className="wrap auth">
      <h1>กรุณาเข้าสู่ระบบก่อนสั่งซื้อ</h1>
      <a href="/"><button>ไปหน้าเข้าสู่ระบบ</button></a>
    </main>
  );

  return (
    <main className="wrap">
      <header>
        <div>
          <div className="brand">TAMJAI<span> SHOP</span></div>
          <p className="muted">เลือกแพ็กเกจที่ต้องการ</p>
        </div>
        <a href="/"><button className="secondary">กลับ Dashboard</button></a>
      </header>

      {notice && <p className="notice">{notice}</p>}

      {done ? (
        <div className="report">
          <h2>ส่งสลิปเรียบร้อย 🎉</h2>
          <p>ทีมงานกำลังตรวจสอบการชำระเงิน เมื่อยืนยันแล้วงานจะเริ่มและหลอดความคืบหน้าจะขึ้นที่หน้า Dashboard</p>
          <a href="/"><button>ไปหน้า Dashboard</button></a>
        </div>
      ) : order && picked ? (
        <div className="report" style={{ maxWidth: 460 }}>
          <h2 style={{ marginTop: 0 }}>ชำระเงิน</h2>
          <p><strong>{picked.name}</strong> · {Number(picked.price_thb).toLocaleString()} บาท</p>
          {qr ? (
            <img src={qr} alt="PromptPay QR" style={{ width: '100%', maxWidth: 300, display: 'block', margin: '8px auto', borderRadius: 12 }} />
          ) : (
            <p className="notice">ยังไม่ได้ตั้ง NEXT_PUBLIC_PROMPTPAY_ID ใน .env.local</p>
          )}
          <p style={{ textAlign: 'center' }}>สแกนจ่ายตามยอดด้านบน แล้วแนบสลิป</p>
          <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} />
          <button disabled={!file || busy} onClick={sendSlip}>{busy ? 'กำลังส่ง...' : 'ส่งสลิป'}</button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
          {products.map(p => (
            <article className="report" key={p.id}>
              <strong style={{ fontSize: 20 }}>{p.name}</strong>
              <p>เป้าหมาย {Number(p.target).toLocaleString()}</p>
              <p style={{ fontSize: 28, fontWeight: 700, color: 'var(--pink-deep)', margin: '6px 0 12px' }}>
                {Number(p.price_thb).toLocaleString()} ฿
              </p>
              <button disabled={busy} onClick={() => buy(p)}>สั่งซื้อ</button>
            </article>
          ))}
          {products.length === 0 && <div className="empty">ยังไม่มีสินค้า</div>}
        </div>
      )}
    </main>
  );
}