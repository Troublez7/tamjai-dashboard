'use client';

import { useEffect, useRef, useState } from 'react';
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
  pearls_session: number | null;
  screenshot_url: string | null;
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
// ลิงก์เชิญถาวรของเซิร์ฟเวอร์ (ห้ามมีตัวอักษรไทย) เช่น https://discord.gg/abc123
const DISCORD_INVITE = 'https://discord.gg/dsdssdsddsdsdsdsdssdsddsdsds';

const resultLabels: Record<string, string> = {
  victory: 'ชนะ',
  defeat: 'แพ้',
  paused: 'พัก',
  rewards: 'รางวัล',
};

const MODE_FILTERS = [
  { key: 'summer', label: 'Summer', test: /summer/i },
  { key: 'dungeon', label: 'Dungeon', test: /dungeon/i },
  { key: 'misty-village', label: 'Misty Village', test: /misty\s*village/i },
  { key: 'misty-tower', label: 'Misty Tower', test: /misty\s*tower/i },
  { key: 'portals', label: 'Portals', test: /portal/i },
  { key: 'challenge', label: 'Challenge', test: /challenge/i },
  { key: 'raid', label: 'Raid', test: /raid/i },
];

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

function DiscordButton({ href }: { href: string }) {
  const iconRef = useRef<SVGSVGElement>(null);

  function shake() {
    iconRef.current?.animate(
      [
        { transform: 'rotate(0deg) scale(1)' },
        { transform: 'rotate(-24deg) scale(1.3)', offset: 0.18 },
        { transform: 'rotate(22deg) scale(1.3)', offset: 0.4 },
        { transform: 'rotate(-16deg) scale(1.2)', offset: 0.6 },
        { transform: 'rotate(10deg) scale(1.1)', offset: 0.8 },
        { transform: 'rotate(0deg) scale(1)' },
      ],
      { duration: 600, easing: 'ease-in-out' }
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="เข้า Discord ร้าน"
      title="เข้า Discord ร้าน"
      className={styles.discordBtn}
      onClick={(e) => {
        // คลิกพิเศษ (Ctrl/Cmd/Shift/ปุ่มกลาง) ให้เบราว์เซอร์จัดการเอง
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        shake();
        window.setTimeout(() => {
          const w = window.open(href, '_blank');
          if (w) w.opener = null;
          else window.location.assign(href); // ถ้าเบราว์เซอร์บล็อกป๊อปอัป ให้เปิดในแท็บเดิมแทน
        }, 450);
      }}
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        flexShrink: 0,
        background: '#ffffff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <svg ref={iconRef} width="20" height="20" viewBox="0 0 24 24" fill="#000000" aria-hidden="true">
        <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
      </svg>
    </a>
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

type ModeOption = { key: string; label: string; count: number };

function ModeFilter({ value, options, onChange }: {
  value: string;
  options: ModeOption[];
  onChange: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find(o => o.key === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.dropdown} ref={ref}>
      <button
        type="button"
        className={styles.dropBtn}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <span className={styles.dropLabel}>{current.label}</span>
        <em>{current.count}</em>
        <svg className={styles.chevron} width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <ul className={styles.dropMenu} role="listbox" aria-label="เลือกโหมด">
          {options.map(o => (
            <li key={o.key} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={o.key === value}
                className={styles.dropItem}
                onClick={() => { onChange(o.key); setOpen(false); }}
              >
                <span>{o.label}</span>
                <em>{o.count}</em>
              </button>
            </li>
          ))}
        </ul>
      )}
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

// Summer Pearls (Session) เป็นยอดสะสมของเซสชัน เลยคิดจำนวนที่ได้เพิ่มจากส่วนต่างของรายงานก่อนหน้า
// ถ้ายอดลดลงแปลว่าเริ่มเซสชันใหม่ ใช้ยอดปัจจุบันเป็นจำนวนที่ได้
function pearlsGained(reports: Report[]): Map<string, number> {
  const gained = new Map<string, number>();
  const lastByWorker = new Map<string, number>();
  const sorted = reports
    .filter(r => (r.result === 'victory' || r.result === 'defeat') && r.pearls_session != null)
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));

  for (const r of sorted) {
    const current = Number(r.pearls_session);
    const previous = lastByWorker.get(r.worker_id);
    if (previous !== undefined) gained.set(r.id, current >= previous ? current - previous : current);
    lastByWorker.set(r.worker_id, current);
  }
  return gained;
}
  function toSeconds(t: string): number | null {
  const parts = t.trim().split(':').map(Number);
  if (parts.length < 2 || parts.length > 3 || parts.some(n => !Number.isFinite(n))) return null;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

function formatDuration(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h} ชม. ${m} นาที` : `${m} นาที ${s} วิ`;
}

function Starfall() {
  return (
    <div className={styles.starfall} aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => <i key={i} />)}
    </div>
  );
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [modeFilter, setModeFilter] = useState('all');
  const [data, setData] = useState<{
    owner: string;
    reports: Report[];
    orders: Order[];
    playCount: number | null;
        totalSeconds: number | null;
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
            const [r, o, c, t] = await Promise.all([
        supabase.from('match_reports')
          .select('id,result,map_name,mode,completion_time,session_time,pearls_session,screenshot_url,created_at,worker_id')
          .order('created_at', { ascending: false }).limit(50),
        supabase.from('orders')
          .select('id,metric,target,progress,status,created_at')
          .order('created_at', { ascending: false }),
        supabase.from('match_reports')
          .select('id', { count: 'exact', head: true })
          .in('result', ['victory', 'defeat']),
        supabase.from('match_reports')
          .select('completion_time')
          .in('result', ['victory', 'defeat'])
          .not('completion_time', 'is', null)
          .limit(2000),
      ]);
      const totalSeconds = t.error
        ? null
        : (t.data ?? []).reduce(
            (sum: number, row: { completion_time: string | null }) =>
              sum + (toSeconds(row.completion_time ?? '') ?? 0),
            0
          );
      if (active) setData({
        owner,
        reports: (r.data ?? []) as Report[],
        orders: (o.data ?? []) as Order[],
        playCount: c.error ? null : (c.count ?? 0),
        totalSeconds,
        error: [r.error?.message, o.error?.message].filter(Boolean).join(' · '),
      });
    }

    void load()owner, reports: [], orders: [], playCount: null,(() => {
      if (active) setData({
        owner, reports: [], orders: [], playCount: null,
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
      <Starfall />
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
  const allGroups = groupReports(reports);
  const gainedMap = pearlsGained(reports);
  const activeFilter = MODE_FILTERS.find(f => f.key === modeFilter);
  const groups = activeFilter
    ? allGroups.filter(g => activeFilter.test.test(g.main.mode ?? ''))
    : allGroups;
  const countFor = (test: RegExp) => allGroups.filter(g => test.test(g.main.mode ?? '')).length;
  const loadedPlays = reports.filter(r => ['victory', 'defeat'].includes(r.result)).length;
  const playCount = current ? (current.playCount ?? loadedPlays) : null;
  const paid = orders.filter(o => ['active', 'completed'].includes(o.status));
  const pending = orders.filter(o => ['pending_payment', 'pending_review'].includes(o.status)).length;
  const target = paid.reduce((sum, o) => sum + Number(o.target), 0);
  const progress = paid.reduce((sum, o) => sum + Number(o.progress), 0);
  const pct = target > 0 ? Math.max(0, Math.min(100, Math.floor(progress / target * 100))) : 0;

  return (
    <main className={styles.page}>
      <Starfall />
      <div className={styles.wrap}>
        <header className={styles.header}>
          <div>
            <Brand />
            <p className={styles.muted}>ภาพรวมการฟาร์มของคุณ</p>
          </div>
          <div className={styles.actions}>
            <button className={styles.secondary} type="button" onClick={signOut}>ออกจากระบบ</button>
            <DiscordProfile key={user.id} user={user} />
            <DiscordButton href={DISCORD_INVITE} />
          </div>
        </header>

        {(notice || current?.error) && <p role="alert" className={styles.card}>{notice || current?.error}</p>}

        <section className={styles.stats}>
          <article className={styles.card}>
            <small>จำนวนครั้งการเล่น</small>
            <strong>{playCount !== null ? playCount.toLocaleString() : '…'}</strong>
          </article>
          <article className={styles.card}>
            <small>สถานะบัญชี</small>
            <strong>เข้าสู่ระบบแล้ว ♡</strong>
          </article>
        </section>
                  <article className={styles.card}>
            <small>เวลาเล่นรวม (Total Time)</small>
            <strong>
              {current && current.totalSeconds !== null ? formatDuration(current.totalSeconds) : '…'}
            </strong>
          </article>
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
          <div className={styles.sectionHead}>
            <h2>ประวัติแมตช์</h2>
            <ModeFilter
              value={modeFilter}
              onChange={setModeFilter}
              options={[
                { key: 'all', label: 'ทั้งหมด', count: allGroups.length },
                ...MODE_FILTERS.map(f => ({ key: f.key, label: f.label, count: countFor(f.test) })),
              ]}
            />
          </div>

          {!current ? <p className={styles.card}>กำลังโหลดประวัติ...</p> :
            groups.length === 0 && !current.error ? (
              <p className={styles.card}>
                {activeFilter ? 'ไม่มีรายงานในโหมดนี้' : 'ยังไม่มีรายงานที่ผูกกับบัญชีนี้'}
              </p>
            ) : (
              <div className={styles.list}>
                {groups.map(({ main: r, rewards }) => {
                  const shots = [r, ...rewards].filter(
                    (s): s is Report & { screenshot_url: string } => Boolean(s.screenshot_url)
                  );
                  const isSummer = /summer/i.test(r.mode ?? '');
                  const gained = gainedMap.get(r.id);

                  return (
                    <article key={r.id} className={styles.card}>
                      <div className={styles.row}>
                        <strong>{r.map_name ?? 'ไม่ทราบชื่อแมป'}</strong>
                        <span className={styles.badge} data-result={r.result}>
                          {resultLabels[r.result] ?? r.result}
                        </span>
                      </div>

                      <div className={styles.tagRow}>
                        <span className={styles.tag}>🎮 {r.mode ?? 'ไม่พบข้อมูลโหมด'}</span>
                        {r.completion_time && (
                          <span className={styles.tag}>⏱️ Total Time <b>{r.completion_time}</b></span>
                        )}
                        {isSummer && gained !== undefined && (
                          <span className={`${styles.tag} ${styles.tagPearl}`}>
                            💎 Summer Pearls <b>+{gained.toLocaleString()}</b>
                          </span>
                        )}
                        {rewards.length > 0 && (
                          <span className={styles.tag}>🎁 รางวัล <b>{rewards.length}</b></span>
                        )}
                      </div>

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