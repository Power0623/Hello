export type Task = { id: string; label: string; tag: string; date: string; done: boolean; completedAt: string | null; deletedAt: string | null };
export type Habit = { id: string; name: string; createdOn: string; archivedOn: string | null; checks: string[]; legacyDays?: boolean[] };
export type Goal = { id: string; name: string; deadline: string; progress: number; archived: boolean };
export type Focus = { id: string; completedAt: string; seconds: number };
export type LumaData = { version: 2; profile: { name: string }; tasks: Task[]; habits: Habit[]; goals: Goal[]; focus: Focus[] };

export const uid = () => crypto.randomUUID();
export function dateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function addDays(key: string, amount: number): string {
  const [year, month, day] = key.split('-').map(Number);
  return dateKey(new Date(year, month - 1, day + amount, 12));
}
export function weekDays(key: string): string[] {
  const day = new Date(`${key}T12:00:00`).getDay();
  const monday = addDays(key, -((day + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}
export const emptyData = (name = ''): LumaData => ({ version: 2, profile: { name }, tasks: [], habits: [], goals: [], focus: [] });
export const visibleTasks = (data: LumaData) => data.tasks.filter(t => !t.deletedAt);
export const activeHabits = (data: LumaData) => data.habits.filter(h => !h.archivedOn);
export function streak(habit: Habit, today: string): number {
  let date = habit.checks.includes(today) ? today : addDays(today, -1);
  let count = 0;
  while (habit.checks.includes(date)) { count++; date = addDays(date, -1); }
  return count;
}
export function weeklyStats(data: LumaData, dates: string[], today: string) {
  const completed = data.tasks.filter(t => t.done && t.completedAt && dates.includes(dateKey(new Date(t.completedAt)))).length;
  const sessions = data.focus.filter(f => dates.includes(dateKey(new Date(f.completedAt))));
  const checks = data.habits.reduce((n, h) => n + h.checks.filter(d => d <= today && dates.includes(d)).length, 0);
  const possible = data.habits.reduce((n, h) => n + dates.filter(d => d <= today && d >= h.createdOn && (!h.archivedOn || d <= h.archivedOn)).length, 0);
  return { completed, checks, seconds: sessions.reduce((n, f) => n + f.seconds, 0), rate: possible ? Math.round(checks / possible * 100) : null,
    bars: dates.map(d => sessions.filter(f => dateKey(new Date(f.completedAt)) === d).reduce((n, f) => n + f.seconds / 60, 0)) };
}

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T12:00:00`).valueOf()) && dateKey(new Date(`${v}T12:00:00`)) === v;
const isTime = (v: unknown): v is string => typeof v === 'string' && /T/.test(v) && Number.isFinite(Date.parse(v));
const str = (v: unknown, max = 200): v is string => typeof v === 'string' && v.length <= max;
const id = (v: unknown): v is string => str(v, 100) && v.length > 0;
const list = (v: unknown, validate: (x: unknown) => boolean) => Array.isArray(v) && v.length <= 20000 && v.every(validate);
const idsUnique = (v: {id: string}[]) => new Set(v.map(x => x.id)).size === v.length;

export function parseData(value: unknown): LumaData {
  if (!isRecord(value) || value.version !== 2 || !isRecord(value.profile) || !str(value.profile.name, 40)
    || !list(value.tasks, t => isRecord(t) && id(t.id) && str(t.label, 60) && t.label.trim().length > 0 && str(t.tag, 30) && isDate(t.date) && typeof t.done === 'boolean' && (t.completedAt === null || isTime(t.completedAt)) && (t.deletedAt === null || isTime(t.deletedAt)))
    || !list(value.habits, h => isRecord(h) && id(h.id) && str(h.name, 40) && h.name.trim().length > 0 && isDate(h.createdOn) && (h.archivedOn === null || (isDate(h.archivedOn) && h.archivedOn >= h.createdOn)) && list(h.checks, d => isDate(d) && d >= (h.createdOn as string) && (!h.archivedOn || d <= (h.archivedOn as string))) && new Set(h.checks as string[]).size === (h.checks as string[]).length && (h.legacyDays === undefined || (Array.isArray(h.legacyDays) && h.legacyDays.length === 7 && h.legacyDays.every(d => typeof d === 'boolean'))))
    || !list(value.goals, g => isRecord(g) && id(g.id) && str(g.name, 60) && g.name.trim().length > 0 && (g.deadline === '' || isDate(g.deadline)) && typeof g.progress === 'number' && Number.isFinite(g.progress) && g.progress >= 0 && g.progress <= 100 && typeof g.archived === 'boolean')
    || !list(value.focus, f => isRecord(f) && id(f.id) && isTime(f.completedAt) && typeof f.seconds === 'number' && Number.isInteger(f.seconds) && f.seconds > 0 && f.seconds <= 10800)) {
    throw new Error('备份格式不正确或数据不完整，未导入任何内容。');
  }
  const data = value as unknown as LumaData;
  if (![data.tasks, data.habits, data.goals, data.focus].every(idsUnique)) throw new Error('备份中有重复记录编号，未导入。');
  // Construct known fields only: backups must never introduce configuration or credentials.
  return { version: 2, profile: { name: data.profile.name },
    tasks: data.tasks.map(t => ({ id: t.id, label: t.label, tag: t.tag, date: t.date, done: t.done, completedAt: t.completedAt, deletedAt: t.deletedAt })),
    habits: data.habits.map(h => ({ id: h.id, name: h.name, createdOn: h.createdOn, archivedOn: h.archivedOn, checks: [...h.checks], ...(h.legacyDays ? {legacyDays: [...h.legacyDays]} : {}) })),
    goals: data.goals.map(g => ({id: g.id, name: g.name, deadline: g.deadline, progress: g.progress, archived: g.archived})),
    focus: data.focus.map(f => ({id: f.id, completedAt: f.completedAt, seconds: f.seconds})) };
}

export function migrateLegacy(raw: unknown, today: string): LumaData {
  if (!isRecord(raw)) throw new Error('旧版数据无法读取，原始记录仍保留。');
  const data = emptyData('闫圣强');
  if (!Array.isArray(raw.tasks) || !Array.isArray(raw.habits) || !Array.isArray(raw.goals)) throw new Error('旧版数据不完整，原始记录仍保留。');
  data.tasks = raw.tasks.map((t, i) => {
    if (!isRecord(t) || !str(t.label, 60) || !str(t.tag, 30) || typeof t.done !== 'boolean') throw new Error('旧版任务无法迁移。');
    // The old version did not save completion dates; do not fabricate weekly history.
    return { id: `legacy-task-${i}`, label: t.label, tag: t.tag, date: today, done: t.done, completedAt: null, deletedAt: null };
  });
  data.habits = raw.habits.map((h, i) => {
    if (!isRecord(h) || !str(h.name, 40) || !Array.isArray(h.days) || h.days.length !== 7 || !h.days.every(x => typeof x === 'boolean')) throw new Error('旧版习惯无法迁移。');
    return {id: `legacy-habit-${i}`, name: h.name, createdOn: today, archivedOn: null, checks: [], legacyDays: h.days};
  });
  data.goals = raw.goals.map((g, i) => {
    if (!isRecord(g) || !str(g.name, 60) || typeof g.progress !== 'number') throw new Error('旧版目标无法迁移。');
    return {id: `legacy-goal-${i}`, name: g.name, deadline: '', progress: Math.min(100, Math.max(0, g.progress)), archived: false};
  });
  return parseData(data);
}

export type TimerState = { id: string; remaining: number; duration: number; endsAt: number | null };
export const freshTimer = (minutes = 25): TimerState => ({id: uid(), remaining: minutes * 60, duration: minutes * 60, endsAt: null});
export function remainingSeconds(timer: TimerState, now = Date.now()): number {
  return timer.endsAt === null ? timer.remaining : Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
}
export function parseTimer(raw: unknown): TimerState | null {
  if (!isRecord(raw) || !id(raw.id) || typeof raw.duration !== 'number' || !Number.isInteger(raw.duration) || raw.duration < 60 || raw.duration > 10800 || typeof raw.remaining !== 'number' || !Number.isInteger(raw.remaining) || raw.remaining < 0 || raw.remaining > raw.duration || (raw.endsAt !== null && (typeof raw.endsAt !== 'number' || !Number.isFinite(raw.endsAt)))) return null;
  return raw as TimerState;
}
