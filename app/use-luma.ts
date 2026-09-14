'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { dateKey, emptyData, freshTimer, migrateLegacy, parseData, parseTimer, remainingSeconds, type Focus, type LumaData, type TimerState } from './luma-model';
import { readCloud, writeCloud } from './luma-cloud';

const LOCAL_KEY = 'luma-data-v2';
export function downloadBackup(data: LumaData) {
  const url = URL.createObjectURL(new Blob([JSON.stringify({format: 'luma-backup', exportedAt: new Date().toISOString(), data}, null, 2)], {type: 'application/json'}));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `Luma-备份-${dateKey()}.json`; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useLuma(client: SupabaseClient | null, userId: string) {
  const [data, render] = useState<LumaData>(emptyData());
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('正在读取记录…');
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [tick, wake] = useState(0);
  const current = useRef(data);
  const revision = useRef(0);
  const changes = useRef(0);
  const saved = useRef(0);
  const saving = useRef(false);
  const alive = useRef(false);
  const blocked = useRef(false);
  const localSnapshot = useRef<string | null>(null);
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    async function load() {
      try {
        let initial: LumaData;
        if (client) {
          const result = await readCloud(client, userId);
          if (cancelled) return;
          initial = result.data; revision.current = result.revision;
        } else {
          const raw = localStorage.getItem(LOCAL_KEY), legacy = localStorage.getItem('luma-data');
          initial = raw ? parseData(JSON.parse(raw)) : legacy ? migrateLegacy(JSON.parse(legacy), dateKey()) : emptyData('闫圣强');
          localStorage.setItem(LOCAL_KEY, JSON.stringify(initial));
          localSnapshot.current = JSON.stringify(initial);
        }
        if (cancelled) return;
        current.current = initial; render(initial); setReady(true);
        setStatus(client ? '已读取云端记录' : '记录保存在此浏览器');
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : '数据读取失败，请先保留原始数据。'); }
    }
    void load();
    return () => { cancelled = true; alive.current = false; };
  }, [client, userId]);
  const update = useCallback((change: (value: LumaData) => LumaData) => {
    if (!ready) return;
    const next = change(current.current);
    if (next === current.current) return;
    current.current = next; changes.current++; render(next); setDirty(true); wake(n => n + 1);
  }, [ready]);
  useEffect(() => {
    if (!ready || saving.current || blocked.current || saved.current === changes.current) return;
    const timeout = setTimeout(async () => {
      saving.current = true;
      setStatus(client ? '正在保存到云端…' : '正在保存…');
      try {
        while (alive.current && saved.current !== changes.current) {
          const generation = changes.current, snapshot = current.current;
          if (client) revision.current = await writeCloud(client, snapshot, revision.current, userId);
          else {
            if (localStorage.getItem(LOCAL_KEY) !== localSnapshot.current) throw new Error('另一个标签页已修改记录，请先导出当前内容，再重新载入。');
            const serialized = JSON.stringify(snapshot);
            localStorage.setItem(LOCAL_KEY, serialized);
            localSnapshot.current = serialized;
          }
          if (!alive.current) return;
          saved.current = generation;
        }
        if (alive.current) { setDirty(false); setError(''); setStatus(client ? '已保存到云端' : '已保存到此浏览器'); }
      } catch (e) {
        blocked.current = true;
        if (alive.current) { setError(e instanceof Error ? e.message : '保存失败，请导出备份后重试。'); setStatus('有尚未保存的修改'); }
      } finally { saving.current = false; }
    }, 400);
    return () => clearTimeout(timeout);
  }, [tick, ready, client, userId]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {event.preventDefault(); event.returnValue = '';};
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  return {data, ready, status, error, dirty, update, retry: () => { blocked.current = false; setError(''); wake(n => n + 1); }};
}

export function useFocus(scope: string, onComplete: (focus: Focus) => void, enabled = true, isSaved: (id: string) => boolean = () => true) {
  const [timer, setTimer] = useState<TimerState | null>(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const complete = useRef(onComplete); complete.current = onComplete;
  const finished = useRef(new Set<string>());
  const storageKey = `luma-timer-${scope}`;
  useEffect(() => {
    let initial = freshTimer();
    try { const raw = localStorage.getItem(storageKey); if (raw) initial = parseTimer(JSON.parse(raw)) ?? initial; }
    catch { setError('计时进度暂时无法在刷新后恢复。'); }
    setTimer(initial);
    const interval = setInterval(() => setNow(Date.now()), 500);
    const wake = () => setNow(Date.now());
    document.addEventListener('visibilitychange', wake);
    return () => {clearInterval(interval); document.removeEventListener('visibilitychange', wake);};
  }, [storageKey]);
  useEffect(() => {
    if (!timer) return;
    try { localStorage.setItem(storageKey, JSON.stringify(timer)); }
    catch { setError('计时进度无法保存，请保持页面打开。'); }
  }, [timer, storageKey]);
  const seconds = timer ? remainingSeconds(timer, now) : 25 * 60;
  useEffect(() => {
    if (!enabled || !timer || timer.endsAt === null || seconds > 0) return;
    if (isSaved(timer.id)) { setTimer(freshTimer(timer.duration / 60)); return; }
    if (finished.current.has(timer.id)) return;
    finished.current.add(timer.id);
    complete.current({id: timer.id, completedAt: new Date(timer.endsAt).toISOString(), seconds: timer.duration});
    // Keep the expired timer on disk until its completion record is saved.
  }, [timer, seconds, enabled, isSaved]);
  return {seconds, running: !!timer?.endsAt, error, minutes: (timer?.duration ?? 1500) / 60,
    toggle: () => { if (!timer) return; const time = Date.now(); setNow(time); setTimer({...timer, remaining: remainingSeconds(timer, time), endsAt: timer.endsAt === null ? time + timer.remaining * 1000 : null}); },
    reset: (minutes = (timer?.duration ?? 1500) / 60) => setTimer(freshTimer(minutes)),
  };
}
