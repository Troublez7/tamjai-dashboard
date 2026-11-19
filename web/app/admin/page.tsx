'use client';
import { useEffect, useState } from 'react';
import { supabaseBrowser } from '../../lib/supabase';

type Order = { id: string; owner_id: string; target: number; status: string; slip_path: string | null; created_at: string; product_id: string | null };
type Worker = { id: string; name: string; owner_id: string };
type Profile = { id: string; display_name: string | null };

const supabase = supabaseBrowser();

export default function Admin() {
  const [ok, setOk] = useState<boolean | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [slips, setSlips] = useState<Record<string, string>>({});
  const [pick, setPick] = useState<Record<string, string>>({});
  const [base, setBase] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');

  async function load() {
    const { data: me } = await supabase.rpc('is_admin');
    if (!me) { setOk(false); return; }
    setOk(true);
    const { data: o } = await supabase.from('orders').select('id,owner_id,target,status,slip_path,created_at,product_id')
      .eq('status', 'pending_review').order('created_at');
    const { data: w } = await supabase.from('workers').select('id,name,owner_id').eq('active', true);
    const { data: p } = await supabase.from('profiles').select('id,display_name');
    const list = (o ?? []) as Order[];
    setOrders(list);
    setWorkers((w ?? []) as Worker[]);
    setProfiles(Object.fromEntries(((p ?? []) as Profile[]).map(x => [x.id, x.display_name ?? x.id.slice(0, 8)])));
    const urls: Record<string, string> = {};
    for (const x of list) {
      if (!x.slip_path) continue;
      const { data } = await supabase.storage.from('slips').createSignedUrl(x.slip_path, 600);
      if (data?.signedUrl) urls[x.id] = data.signedUrl;
    }
    setSlips(urls);
  }
  useEffect(() => { load(); }, []);

  async function approve(o: Order) {
    const wid = pick[o.id] || workers.find(w => w.owner_id === o.owner_id)?.id;
    if (!wid) { setNotice('เลือก worker ก่อน'); return; }
    const { error } = await supabase.rpc('admin_approve_order', {
      p_order_id: o.id, p_worker_id: wid, p_baseline: Number(base[o.id] || 0)
    });
    setNotice(error ? error.message : 'อนุมัติแล้ว');
    load();
  }
  async function reject(o: Order) {
    if (!confirm('ปฏิเสธออเดอร์นี้?')) return;
    const { error } = await supabase.rpc('admin_reject_order', { p_order_id: o.id });
    setNotice(error ? error.message : 'ปฏิเสธแล้ว');
    load();
  }

  if (ok === null) return <main className="wrap">กำลังโหลด...</main>;
  if (!ok) return <main className="wrap auth"><h1>ไม่มีสิทธิ์เข้าถึง</h1><a href="/"><button>กลับหน้าแรก</button></a></main>;

  return (
    <main className="wrap">
      <header>
        <div><div className="brand">TAMJAI<span> ADMIN</span></div><p className="muted">ออเดอร์รอตรวจสลิป</p></div>
        <a href="/"><button className="secondary">กลับ Dashboard</button></a>
      </header>
      {notice && <p className="notice">{notice}</p>}
      {orders.length === 0 ? <div className="empty">ไม่มีออเดอร์ที่รอตรวจสอบ</div> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {orders.map(o => (
            <article className="report" key={o.id}>
              <strong style={{ fontSize: 18 }}>{profiles[o.owner_id] ?? o.owner_id.slice(0, 8)}</strong>
              <p>Summer Pearls {Number(o.target).toLocaleString()}</p>
              <small>{new Date(o.created_at).toLocaleString('th-TH')}</small>
              {slips[o.id] && (
                <a href={slips[o.id]} target="_blank" rel="noreferrer">
                  <img src={slips[o.id]} alt="slip" style={{ width: '100%', maxHeight: 260, objectFit: 'contain', borderRadius: 10, marginTop: 10, background: '#fff0f5' }} />
                </a>
              )}
              <select value={pick[o.id] ?? workers.find(w => w.owner_id === o.owner_id)?.id ?? ''}
                onChange={e => setPick({ ...pick, [o.id]: e.target.value })}
                style={{ width: '100%', padding: 12, marginTop: 10, borderRadius: 12, border: '2px solid var(--border)', font: 'inherit' }}>
                <option value="">เลือก worker</option>
                {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
              <input type="number" placeholder="ยอดไข่มุกเซสชันปัจจุบัน (ว่าง = 0)" value={base[o.id] ?? ''}
                onChange={e => setBase({ ...base, [o.id]: e.target.value })} style={{ marginTop: 10 }} />
              <button onClick={() => approve(o)}>อนุมัติ</button>
              <button className="secondary" onClick={() => reject(o)}>ปฏิเสธ</button>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}