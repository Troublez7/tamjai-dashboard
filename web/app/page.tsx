'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabaseBrowser } from '../lib/supabase';
import styles from './dashboard.module.css';

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

type Group = { main: Report; rewards: Report[] };

const supabase = supabaseBrowser();

const resultLabels: Record<string, string> = {
  victory: 'ชนะ',
  defeat: 'แพ้',
  paused: 'พัก',
  rewards: 'รางวัล',
};

function Heart() {
  const shape =
    'M24 41 C20 38 5 28 5 16 C5 5 18 3 24 12 C30 3 43 5 43 16 C43 28 28 38 24 41 Z';

  return (
    <svg className={styles.heart} viewBox="0 0 48 48" aria-hidden="true">
      <path d={shape} fill="#242424" stroke="#161616" strokeWidth="5" />
      <path
        className={styles.heartLight}
        d={shape}
        pathLength="100"
        fill="none"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeDasharray="13 87"
      />
      <circle cx="18" cy="22" r="1.5" fill="white" />
      <circle cx="30" cy="22" r="1.5" fill="white" />
      <path d="M21 26 Q24 29 27 26" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function Brand() {
  return (
    <div className={styles.brand}>
      <Heart />
      <span>TAMJAI <b>DASHBOARD</b></span>
    </div>
  );
}

function DiscordProfile({ user }: { user: User }) {
  const identity = user.identities?.find(item => item.provider === 'discord');
  const profile = {
    ...(user.app_metadata?.provider === 'discord' ? user.user_metadata : {}),
    ...(identity?.identity_data ?? {}),
  };

  const name = [
    profile.global_name, profile.full_name, profile.preferred_username,
    profile.user_name, profile.username, profile.name,
  ].find((v): v is string =>
    typeof v === 'string' && v.trim() !== '' && v !== user.email
  ) ?? 'ผู้ใช้ Discord';

  const avatar = [profile.avatar_url, profile.picture].find(
    (v): v is string => typeof v === 'string' && v.startsWith('https://')
  );
  const [failed, setFailed] = useState<string | null>(null);

  return (
    <div className={styles.profile}>
      <strong title={name}>{name}</strong>
      <span className={styles.avatar}>
        {avatar && avatar !== failed ? (
          <img src={avatar} alt="" width={36} height={36} onError={() => setFailed(avatar)} />
        ) : <Heart />}
      </span>
    </div>
  );
}

function groupReports(reports: Report[]): Group[] {
  const groups: Group[] = [];
  const sorted = [...reports].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

  for (const report of sorted) {
    if (report.result === 'rewards') {
      const match = [...groups].reverse().find(({ main }) => {
        const gap = Date.parse(report.created_at) - Date.parse(main.created_at);
        return main.worker_id === report.worker_id &&
          (main.result === 'victory' || main.result === 'defeat') &&
          gap >= 0 && gap <= 120_000;
      });
      if (match) {
        match.rewards.push(report);
        continue;
      }
    }
    groups.push({ main: report, rewards: [] });
  }

  return groups.reverse();
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [data, setData] = useState<{
    owner: string;
    reports: Report[];
    orders: Order[];
    error: string;
  } | null>(null);
  const userId = user?.id;

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;
    setData(null);
    if (!userId) return;
    const owner = userId;

    async function load() {
      const [r, o] = await Promise.all([
        supabase.from('match_reports')
          .select('id,result,map_name,mode,completion_time,session_time,wins_losses,screenshot_url,raw_text,created_at,worker_id')
          .order('created_at', { ascending: false }).limit(50),
        supabase.from('orders')
          .select('id,metric,target,progress,status,created_at')
          .order('created_at', { ascending: false }),
      ]);
      if (active) setData({
        owner,
        reports: (r.data ?? []) as Report[],
        orders: (o.data ?? []) as Order[],
        error: [r.error?.message, o.error?.message].filter(Boolean).join(' · '),
      });
    }

    void load().catch(() => {
      if (active) setData({
        owner, reports: [], orders: [],
        error: 'โหลดข้อมูลไม่สำเร็จ กรุณารีเฟรชหน้าเพื่อลองอีกครั้ง',
      });
    });
    return () => { active = false; };
  }, [userId]);

  async function signIn() {
    setNotice('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo: window.location.origin },
    });
    if (error) setNotice(error.message);
  }

  async function signOut() {
    setNotice('');
    const { error } = await supabase.auth.signOut();
    if (error) setNotice(error.message);
  }

  if (!authReady) return <main className={styles.page}>กำลังโหลด...</main>;

  if (!user) return (
    <main className={styles.page}>
      <section className={`${styles.card} ${styles.login}`}>
        <Brand />
        <h1>เข้าสู่ระบบลูกค้า</h1>
        <p className={styles.muted}>ล็อกอินด้วย Discord เพื่อดูงานและติดตามออเดอร์ของคุณ</p>
        <button className={styles.primary} type="button" onClick={signIn}>เข้าสู่ระบบด้วย Discord</button>
        {notice && <p role="alert">{notice}</p>}
      </section>
    </main>
  );

  const current = data?.owner === user.id ? data : null;
  const reports = current?.reports ?? [];
  const orders = current?.orders ?? [];
  const groups = groupReports(reports);
  const matchCount = reports.filter(r => ['victory', 'defeat'].includes(r.result)).length;
  const paid = orders.filter(o => ['active', 'completed'].includes(o.status));
  const pending = orders.filter(o => ['pending_payment', 'pending_review'].includes(o.status)).length;
  const target = paid.reduce((sum, o) => sum + Number(o.target), 0);
  const progress = paid.reduce((sum, o) => sum + Number(o.progress), 0);
  const pct = target > 0 ? Math.max(0, Math.min(100, Math.floor(progress / target * 100))) : 0;

  return (
    <main className={styles.page}>
      <div className={styles.wrap}>
        <header className={styles.header}>
          <div>
            <Brand />
            <p className={styles.muted}>ภาพรวมการฟาร์มของคุณ</p>
          </div>
          <div className={styles.actions}>
            <button className={styles.secondary} type="button" onClick={signOut}>ออกจากระบบ</button>
            <DiscordProfile key={user.id} user={user} />
          </div>
        </header>

        {(notice || current?.error) && <p role="alert" className={styles.card}>{notice || current?.error}</p>}

        <section className={styles.stats}>
          <article className={styles.card}>
            <small>แมตช์ล่าสุด (ชนะ/แพ้)</small>
            <strong>{current ? matchCount : '…'}</strong>
          </article>
          <article className={styles.card}>
            <small>สถานะบัญชี</small>
            <strong>เข้าสู่ระบบแล้ว ♡</strong>
          </article>
        </section>

        {(paid.length > 0 || pending > 0) && (
          <section>
            <h2>งานของคุณ</h2>
            {paid.length > 0 && (
              <article className={styles.card}>
                <div className={styles.row}>
                  <strong>Summer Pearls {target.toLocaleString()}</strong>
                  <span className={styles.badge}>
                    {paid.every(o => o.status === 'completed') ? 'เสร็จแล้ว' : 'กำลังฟาร์ม'}
                  </span>
                </div>
                <div className={styles.track} role="progressbar" aria-label="ความคืบหน้าของงาน"
                  aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                  <div style={{ width: `${pct}%` }} />
                </div>
                <small>
                  {progress.toLocaleString()} / {target.toLocaleString()} · {pct}%
                  {paid.length > 1 && ` · รวม ${paid.length} ออเดอร์`}
                </small>
              </article>
            )}
            {pending > 0 && <p className={styles.muted}>มี {pending} ออเดอร์รอตรวจสอบการชำระเงิน</p>}
          </section>
        )}

        <section>
          <h2>ประวัติแมตช์</h2>
          {!current ? <p className={styles.card}>กำลังโหลดประวัติ...</p> :
            groups.length === 0 && !current.error ? (
              <p className={styles.card}>ยังไม่มีรายงานที่ผูกกับบัญชีนี้</p>
            ) : (
              <div className={styles.list}>
                {groups.map(({ main: r, rewards }) => {
                  const shots = [r, ...rewards].filter(
                    (s): s is Report & { screenshot_url: string } => Boolean(s.screenshot_url)
                  );

                  return (
                    <article key={r.id} className={styles.card}>
                      <div className={styles.row}>
                        <strong>{r.map_name ?? 'ไม่ทราบชื่อแมป'}</strong>
                        <span className={styles.badge} data-result={r.result}>
                          {resultLabels[r.result] ?? r.result}
                        </span>
                      </div>
                      <p>
                        {r.mode ?? 'ไม่พบข้อมูลโหมด'}
                        {r.completion_time ? ` · ใช้เวลา ${r.completion_time}` :
                          r.session_time ? ` · เวลาเล่น ${r.session_time}` : ''}
                        {r.wins_losses && ` · W/L ${r.wins_losses}`}
                        {rewards.length > 0 && ` · รางวัล ${rewards.length}`}
                      </p>
                      <small>{new Date(r.created_at).toLocaleString('th-TH')}</small>

                      {shots.length > 0 && (
                        <div className={styles.gallery}>
                          {shots.map((s, i) => (
                            <a key={s.id} href={s.screenshot_url} target="_blank" rel="noreferrer"
                              aria-label={`เปิดภาพ ${i + 1} ของ ${r.map_name ?? 'แมตช์นี้'} ขนาดเต็ม`}>
                              <img src={s.screenshot_url} alt={`ภาพ${resultLabels[s.result] ?? s.result}`}
                                loading="lazy" />
                            </a>
                          ))}
                        </div>
                      )}

                      <details className={styles.details}>
                        <summary>ดูข้อมูลรายงาน</summary>
                        <pre>{[r, ...rewards].map(s => s.raw_text).join('\n\n---\n\n')}</pre>
                      </details>
                    </article>
                  );
                })}
              </div>
            )}
        </section>
      </div>
    </main>
  );
}
