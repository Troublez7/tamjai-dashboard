'use client';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabaseBrowser } from '../lib/supabase';

type Report = {
  id: string;
  result: string;
  map_name: string | null;
  mode: string | null;
  completion_time: string | null;
  session_time: string | null;
  wins_losses: string | null;
  screenshot_url: string | null;
  raw_text: string;
  created_at: string;
  worker_id: string;
};

type Order = {
  id: string;
  metric: string;
  target: number;
  progress: number;
  status: string;
  created_at: string;
};

const supabase = supabaseBrowser();

const RESULT_COLOR: Record<string, string> = {
  victory: '#4ade80',
  defeat: '#f87171',
  paused: '#facc15'
};

function Cat() {
  return (
    <svg width="40" height="40" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M10 28 L12 6 L28 16 Z" fill="#ffb3cc" stroke="#5a3a47" strokeWidth="3" strokeLinejoin="round" />
      <path d="M54 28 L52 6 L36 16 Z" fill="#ffb3cc" stroke="#5a3a47" strokeWidth="3" strokeLinejoin="round" />
      <ellipse cx="32" cy="36" rx="24" ry="21" fill="#fff" stroke="#5a3a47" strokeWidth="3" />
      <circle cx="23" cy="34" r="3" fill="#5a3a47" />
      <circle cx="41" cy="34" r="3" fill="#5a3a47" />
      <ellipse cx="18" cy="42" rx="4" ry="2.5" fill="#ffb3cc" />
      <ellipse cx="46" cy="42" rx="4" ry="2.5" fill="#ffb3cc" />
      <path d="M29 41 Q32 45 35 41" fill="none" stroke="#5a3a47" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M30 38 L34 38 L32 40 Z" fill="#ff5c93" />
    </svg>
  );
}

type Group = { main: Report; rewards: Report[] };

function groupReports(list: Report[]): Group[] {
  const asc = [...list].sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
  const groups: Group[] = [];
  const WINDOW_MS = 2 * 60 * 1000;

  for (const r of asc) {
    if (r.result === 'rewards') {
      const last = [...groups].reverse().find(
        g => g.main.worker_id === r.worker_id &&
             (g.main.result === 'victory' || g.main.result === 'defeat') &&
             +new Date(r.created_at) - +new Date(g.main.created_at) <= WINDOW_MS &&
             +new Date(r.created_at) >= +new Date(g.main.created_at)
      );
      if (last) { last.rewards.push(r); continue; }
    }
    groups.push({ main: r, rewards: [] });
  }
  return groups.reverse();
}

function mergeOrders(list: Order[]) {
  const paid = list.filter(o => o.status === 'active' || o.status === 'completed');
  if (paid.length === 0) return null;
  const target = paid.reduce((s, o) => s + Number(o.target), 0);
  const progress = paid.reduce((s, o) => s + Number(o.progress), 0);
  const done = paid.every(o => o.status === 'completed');
  return { target, progress, done, count: paid.length };
}

export default function Home() {
  const [user,setUser] = useState<User|null>(null);
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [reports,setReports] = useState<Report[]>([]);
  const [orders,setOrders] = useState<Order[]>([]);
  const [notice,setNotice] = useState('');
  const [loading,setLoading] = useState(true);

  async function loadReports() {
    const { data, error } = await supabase
      .from('match_reports')
      .select('id,result,map_name,mode,completion_time,session_time,wins_losses,screenshot_url,raw_text,created_at,worker_id')
      .order('created_at',{ascending:false})
      .limit(50);
    if (error) setNotice(error.message); else setReports((data ?? []) as Report[]);

    const { data: o } = await supabase
      .from('orders')
      .select('id,metric,target,progress,status,created_at')
      .order('created_at',{ascending:false});
    setOrders((o ?? []) as Order[]);
  }
  useEffect(() => {
    supabase.auth.getUser().then(({data}) => { setUser(data.user); setLoading(false); if(data.user) loadReports(); });
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event,session) => {
      setUser(session?.user ?? null);
      if(session?.user) loadReports(); else { setReports([]); setOrders([]); }
    });
    return () => subscription.unsubscribe();
  },[]);
  async function signInDiscord() {
  setNotice('');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'discord',
    options: { redirectTo: window.location.origin }
  });
  if (error) setNotice(error.message);
}
  async function signOut() { await supabase.auth.signOut(); }
  async function linkDiscord() {
  const { error } = await supabase.auth.linkIdentity({
    provider: 'discord',
    options: { redirectTo: window.location.origin }
  });
  if (error) setNotice(error.message);
}
  if (loading) return <main className="wrap">กำลังโหลด...</main>;
  if (!user) return (
  <main className="wrap auth">
    <div className="brand"><Cat />TAMJAI<span> DASHBOARD</span></div>
    <h1>เข้าสู่ระบบลูกค้า</h1>
    <p>ล็อกอินด้วย Discord เพื่อดูงานและความคืบหน้าของออเดอร์</p>
    <button onClick={signInDiscord}>เข้าสู่ระบบด้วย Discord</button>
    {notice && <p className="notice">{notice}</p>}
  </main>
);

  const matchCount = reports.filter(r => r.result === 'victory' || r.result === 'defeat').length;
  const groups = groupReports(reports);
  const merged = mergeOrders(orders);
  const pendingCount = orders.filter(o => o.status === 'pending_payment' || o.status === 'pending_review').length;

  return (
    <main className="wrap">
      <header>
        <div>
          <div className="brand"><Cat />TAMJAI<span> DASHBOARD</span></div>
          <p className="muted">ภาพรวมการฟาร์มของคุณ</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href="/shop"><button>ซื้อบริการ</button></a>
          <button className="secondary" onClick={signOut}>ออกจากระบบ</button>
        </div>
      </header>

      <section className="stats">
        <article><small>บัญชี</small><strong>{user.email}</strong></article>
        <article><small>แมตช์ล่าสุด (ชนะ/แพ้)</small><strong>{matchCount}</strong></article>
        <article><small>สถานะ</small><strong className="green">CONNECTED</strong></article>
      </section>

      {(merged || pendingCount > 0) && (
        <>
          <h2>งานของคุณ</h2>
          {merged && (() => {
            const pct = Math.min(100, Math.floor((merged.progress / merged.target) * 100));
            return (
              <article className="report" style={{ marginBottom: 14 }}>
                <div className="reporttop">
                  <strong>Summer Pearls {merged.target.toLocaleString()}</strong>
                  <span className="pill">{merged.done ? 'เสร็จแล้ว' : 'กำลังฟาร์ม'}</span>
                </div>
                <div className={`bar ${pct >= 100 ? 'bar-done' : ''}`}>
                  <div className="bar-fill" style={{ width: `${Math.max(pct, 2)}%` }} />
                </div>
                <small>
                  {merged.progress.toLocaleString()} / {merged.target.toLocaleString()} · <span className="pct">{pct}%</span>
                  {merged.count > 1 ? ` · รวม ${merged.count} ออเดอร์` : ''}
                </small>
              </article>
            );
          })()}
          {pendingCount > 0 && (
            <p className="muted">มี {pendingCount} ออเดอร์รอตรวจสอบการชำระเงิน หลอดจะเริ่มเมื่อยืนยันแล้ว</p>
          )}
        </>
      )}

      <h2>Match History</h2>
      {notice && <p className="notice">{notice}</p>}

      {reports.length === 0 ? (
        <div className="empty">ยังไม่มีรายงานที่ผูกกับบัญชีนี้</div>
      ) : (
        <div className="reports" style={{ display: 'grid', gap: 16 }}>
          {groups.map(({ main: r, rewards }) => {
            const shots = [r, ...rewards].filter(x => x.screenshot_url);
            const dotColor = RESULT_COLOR[r.result] ?? '#94a3b8';
            return (
              <article className="report" key={r.id}>
                <div className="reporttop">
                  <strong>{r.map_name ?? 'Unknown Map'}</strong>
                  <span
                    title={r.result.toUpperCase()}
                    style={{ width: 14, height: 14, borderRadius: '50%', background: dotColor, boxShadow: `0 0 8px ${dotColor}`, display: 'inline-block', flexShrink: 0 }}
                  />
                </div>
                <p>
                  {r.mode ?? 'Mode not detected'}
                  {' · '}
                  {r.completion_time ? `Total ${r.completion_time}` : r.session_time ? `Session ${r.session_time}` : 'Time unavailable'}
                  {r.wins_losses ? ` · W/L ${r.wins_losses}` : ''}
                  {rewards.length > 0 ? ` · รางวัล ${rewards.length}` : ''}
                </p>
                <small>{new Date(r.created_at).toLocaleString('th-TH')}</small>

                {shots.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 10 }}>
                    {shots.map(s => (
                      <a key={s.id} href={s.screenshot_url!} target="_blank" rel="noreferrer">
                        <img src={s.screenshot_url!} alt={s.result} loading="lazy" style={{ width: '100%', aspectRatio: '16 / 10', objectFit: 'cover', borderRadius: 8, display: 'block' }} />
                      </a>
                    ))}
                  </div>
                )}

                <details>
                  <summary>ดูข้อมูลรายงาน</summary>
                  <pre>{[r, ...rewards].map(x => x.raw_text).join('\n\n---\n\n')}</pre>
                </details>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}