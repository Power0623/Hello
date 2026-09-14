'use client';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { activeHabits, addDays, dateKey, streak, visibleTasks, weekDays, weeklyStats, type Goal, type Habit, type LumaData, type Task } from './luma-model';
import { loadCloud } from './luma-cloud';
import { downloadBackup, useFocus, useLuma } from './use-luma';
import { GoalEditor, HabitEditor, Settings, TaskEditor } from './luma-editors';

type View = '今日' | '任务' | '习惯' | '目标' | '回顾' | '设置';
const navigation: [string, View][] = [['⌘','今日'],['✓','任务'],['◌','习惯'],['◇','目标'],['↗','回顾']];
const weekdays = ['一','二','三','四','五','六','日'];

export default function LumaApp() {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    let unsubscribe: (() => void) | undefined;
    void loadCloud().then(async cloud => {
      if (!alive) return;
      if (cloud) {
        const {data, error: authError} = await cloud.auth.getSession();
        if (!alive) return;
        if (authError) throw authError;
        setClient(cloud); setUser(data.session?.user ?? null);
        const result = cloud.auth.onAuthStateChange((_event, session) => { if (alive) setUser(session?.user ?? null); });
        unsubscribe = () => result.data.subscription.unsubscribe();
      }
      setLoading(false);
    }).catch(() => { if (alive) {setError('账号服务暂时无法连接，请刷新重试。'); setLoading(false);} });
    return () => {alive = false; unsubscribe?.();};
  }, []);
  if (loading) return <Welcome><p role="status">正在打开你的 Luma…</p></Welcome>;
  if (error) return <Welcome><p role="alert">{error}</p><button onClick={() => location.reload()}>重新加载</button></Welcome>;
  if (client && !user) return <SignIn client={client} />;
  return <Workspace key={user?.id ?? 'local'} client={client} user={user} />;
}

function Welcome({children}: {children: ReactNode}) {
  return <main className="welcome"><section className="welcome-card"><span className="brand-mark">L</span><p className="section-kicker">LUMA · 人生操作系统</p><h1>把日子，过成自己的节奏。</h1>{children}</section></main>;
}

function SignIn({client}: {client: SupabaseClient}) {
  const [email, setEmail] = useState(''), [code, setCode] = useState('');
  const [sent, setSent] = useState(false), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(''), [nextSend, setNextSend] = useState(0);
  async function send(event?: FormEvent) {
    event?.preventDefault(); if (Date.now() < nextSend) {setMessage('请稍等一分钟再重新发送。'); return;}
    setBusy(true); setMessage('');
    try {
      const {error} = await client.auth.signInWithOtp({email: email.trim(), options: {emailRedirectTo: `${location.origin}${location.pathname}`}});
      if (error) throw error;
      setSent(true); setNextSend(Date.now() + 60000); setMessage('邮件已发送。请输入验证码；如果邮件中是登录链接，也可以点击链接返回。');
    } catch {setMessage('邮件暂时未能发送，请检查邮箱地址或稍后重试。');}
    finally {setBusy(false);}
  }
  async function verify(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage('');
    try { const {error} = await client.auth.verifyOtp({email: email.trim(), token: code.trim(), type: 'email'}); if (error) throw error; }
    catch {setMessage('验证码无效或已过期，请重试或重新发送。');}
    finally {setBusy(false);}
  }
  return <Welcome><p>使用邮箱登录，第一次验证成功会自动创建账号。每个人拥有自己的任务、习惯和目标。</p>
    <form className="editor" onSubmit={sent ? verify : send}><label>邮箱<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} disabled={sent || busy} placeholder="you@example.com" /></label>
      {sent && <label>邮件验证码<input required inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={10} value={code} onChange={e => setCode(e.target.value)} /></label>}
      <button className="primary-button" disabled={busy}>{busy ? '请稍候…' : sent ? '验证并进入' : '发送登录邮件'}</button>
      {sent && <div className="inline-actions"><button type="button" disabled={busy} onClick={() => {setSent(false); setCode(''); setMessage('');}}>更换邮箱</button><button type="button" disabled={busy} onClick={() => void send()}>重新发送</button></div>}
      {message && <p role="status">{message}</p>}
    </form><p className="muted">任务和打卡记录仅对当前账号可见。</p></Welcome>;
}

function Workspace({client, user}: {client: SupabaseClient | null; user: User | null}) {
  const store = useLuma(client, user?.id ?? 'local');
  const {data, update} = store;
  const [active, setActive] = useState<View>('今日');
  const [today, setToday] = useState(dateKey()), [toast, setToast] = useState('');
  const [taskEditor, setTaskEditor] = useState<Task | 'new' | null>(null);
  const [habitEditor, setHabitEditor] = useState<Habit | 'new' | null>(null);
  const [goalEditor, setGoalEditor] = useState<Goal | 'new' | null>(null);
  const [undo, setUndo] = useState<{id: string; kind: 'task' | 'habit' | 'goal'} | null>(null);
  const [filter, setFilter] = useState('all'), [query, setQuery] = useState('');
  const [weekOffset, setWeekOffset] = useState(0), [signingOut, setSigningOut] = useState(false);
  // Keep the timer mounted across navigation. Completion is recorded once by ID.
  const focus = useFocus(user?.id ?? 'local', entry => {
    update(d => d.focus.some(f => f.id === entry.id) ? d : {...d, focus: [...d.focus, entry]});
    setToast('专注完成，已记录到回顾。去喝口水吧。');
  }, store.ready, id => !store.dirty && data.focus.some(f => f.id === id));
  useEffect(() => { const handle = setInterval(() => setToday(dateKey()), 1000); return () => clearInterval(handle); }, []);
  useEffect(() => {if (toast) {const handle = setTimeout(() => setToast(''), 4500); return () => clearTimeout(handle);}}, [toast]);
  const tasks = visibleTasks(data), habits = activeHabits(data), goals = data.goals.filter(g => !g.archived);
  const dates = weekDays(addDays(today, weekOffset * 7)), stats = weeklyStats(data, dates, today);
  const thisWeek = weeklyStats(data, weekDays(today), today);
  const todayTasks = tasks.filter(t => t.date <= today && !t.done).slice(0,3);
  const shown = tasks.filter(t => (filter === 'all' || (filter === 'today' ? t.date === today : filter === 'done' ? t.done : !t.done)) && `${t.label} ${t.tag}`.toLowerCase().includes(query.toLowerCase()));
  const shownHabits = data.habits.filter(h => h.createdOn <= dates[6] && (!h.archivedOn || h.archivedOn >= dates[0]));
  const toggleTask = (id: string) => update(d => ({...d, tasks: d.tasks.map(t => t.id === id ? {...t, done: !t.done, completedAt: t.done ? null : new Date().toISOString()} : t)}));
  const checkHabit = (id: string, day: string) => {
    if (day > today) return;
    update(d => ({...d, habits: d.habits.map(h => h.id !== id || day < h.createdOn || (h.archivedOn && day > h.archivedOn) ? h : {...h, checks: h.checks.includes(day) ? h.checks.filter(x => x !== day) : [...h.checks, day]})}));
  };
  const remove = (kind: 'task' | 'habit' | 'goal', id: string) => {
    update(d => kind === 'task' ? {...d, tasks: d.tasks.map(t => t.id === id ? {...t, deletedAt: new Date().toISOString()} : t)}
      : kind === 'habit' ? {...d, habits: d.habits.map(h => h.id === id ? {...h, archivedOn: today} : h)}
      : {...d, goals: d.goals.map(g => g.id === id ? {...g, archived: true} : g)});
    setUndo({id,kind}); setToast(kind === 'task' ? '任务已删除，可撤销；完成记录仍保留。' : '已归档，可撤销。');
  };
  function restore() {
    if (!undo) return;
    update(d => undo.kind === 'task' ? {...d, tasks: d.tasks.map(t => t.id === undo.id ? {...t, deletedAt: null} : t)}
      : undo.kind === 'habit' ? {...d, habits: d.habits.map(h => h.id === undo.id ? {...h, archivedOn: null} : h)}
      : {...d, goals: d.goals.map(g => g.id === undo.id ? {...g, archived: false} : g)});
    setUndo(null); setToast('已恢复');
  }
  if (!store.ready) return <Welcome><p role={store.error ? 'alert' : 'status'}>{store.error || store.status}</p><button onClick={() => location.reload()}>重新读取</button></Welcome>;
  const name = data.profile.name || '新朋友', hour = new Date().getHours();
  const greeting = hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
  async function signOut() {
    if (!client || store.dirty) return;
    setSigningOut(true);
    try {const {error} = await client.auth.signOut(); if (error) throw error;}
    catch {setToast('退出失败，请检查网络后重试。'); setSigningOut(false);}
  }
  return <main className="shell"><aside className="sidebar"><button className="brand" onClick={() => setActive('今日')}><span className="brand-mark">L</span><span>Luma</span></button>
    <nav aria-label="主导航">{navigation.map(([icon,label]) => <button key={label} className={`nav-item ${active === label ? 'active' : ''}`} aria-label={label} aria-current={active === label ? 'page' : undefined} onClick={() => {setActive(label); setWeekOffset(0);}}><span className="nav-icon">{icon}</span><span>{label}</span></button>)}</nav>
    <button className="profile-link" onClick={() => setActive('设置')}><span className="mini-avatar">{name.slice(0,1)}</span><span><strong>{name}</strong><small>{client ? '我的个人空间' : '此浏览器的记录'}</small></span></button></aside>
    <section className="workspace"><header className="topbar"><div><p className="eyebrow">{new Intl.DateTimeFormat('zh-CN', {month:'long',day:'numeric',weekday:'long'}).format(new Date(`${today}T12:00:00`))}</p><h1>{active === '今日' ? `${greeting}，${name}` : active}</h1></div><div className="top-actions"><button className="icon-button" aria-label="个人与数据设置" onClick={() => setActive('设置')}>⚙</button><button className="primary-button" onClick={() => setTaskEditor('new')}>+　快速记录</button></div></header>
      <div className="save-strip"><span role="status">{store.dirty ? '有修改待保存' : store.status}</span>{!client && <span>账号云同步尚未开通</span>}{undo && <button onClick={restore}>撤销上次{undo.kind === 'task' ? '删除' : '归档'}</button>}</div>
      {store.error && <div className="error-banner" role="alert"><p>{store.error}</p><button onClick={store.retry}>重试保存</button><button onClick={() => downloadBackup(data)}>导出备份</button><button onClick={() => {if (!store.dirty || confirm('重新载入会丢弃当前未保存修改。请先导出备份，确定继续吗？')) location.reload();}}>重新载入</button></div>}
      {!data.profile.name && <div className="info-banner">欢迎来到你的空间。<button onClick={() => setActive('设置')}>先设置你的名字</button></div>}
      {active === '今日' && <div className="dashboard-grid">
        <FocusCard focus={focus}/>
        <section className="progress-card card"><Heading kicker="本周节奏" title="每一步，都算数" action={<button onClick={() => {setActive('回顾'); setWeekOffset(0);}} aria-label="查看本周报告">↗</button>} /><Bars values={thisWeek.bars} dates={weekDays(today)} /><p className="progress-note">本周已完成 <strong>{Math.round(thisWeek.seconds/60)} 分钟</strong>专注</p></section>
        <section className="tasks-card card"><Heading kicker="今日与未完成事项" title="先做好这三件事" action={<span className="count">待办 {tasks.filter(t => !t.done && t.date <= today).length}</span>} />
          {todayTasks.length ? todayTasks.map(t => <button className="task" key={t.id} onClick={() => toggleTask(t.id)}><span className="check"/><span className="task-label">{t.label}<small>{t.tag} · {t.date < today ? `待续 · ${t.date}` : '今天'}</small></span></button>) : <Empty text="今天的清单很轻，记下想做的一件事吧。" />}
          <div className="inline-actions"><button className="add-task" onClick={() => setTaskEditor('new')}>+ 添加任务</button><button onClick={() => setActive('任务')}>查看全部 →</button></div></section>
        <section className="habits-card card"><Heading kicker="微小习惯" title="给今天一个勾" action={<span className="count">{habits.filter(h => h.checks.includes(today)).length} / {habits.length}</span>} />
          {habits.slice(0,3).map(h => <button className="habit-row compact-habit" key={h.id} onClick={() => checkHabit(h.id,today)}><span className="habit-symbol book">◌</span><div><strong>{h.name}</strong><small>连续 {streak(h,today)} 天</small></div><span className={`habit-check ${h.checks.includes(today) ? '' : 'empty'}`}>{h.checks.includes(today) ? '✓' : ''}</span></button>)}
          {!habits.length && <Empty text="从一个容易坚持的习惯开始。" />}<button className="add-task" onClick={() => setHabitEditor('new')}>+ 新建习惯</button></section>
      </div>}
      {active === '任务' && <div className="view-stack"><Intro kicker="轻装上阵" title="把事情从脑子里搬出来" detail={`${tasks.filter(t => !t.done).length} 件待完成 · ${tasks.filter(t => t.done).length} 件已完成`} action={<button className="primary-button" onClick={() => setTaskEditor('new')}>+ 新任务</button>} />
        <section className="large-card"><div className="filter-row">{[['all','全部'],['today','今天'],['open','未完成'],['done','已完成']].map(([key,label]) => <button key={key} className={filter === key ? 'selected' : ''} onClick={() => setFilter(key)}>{label}</button>)}</div><input className="search-input" aria-label="搜索任务" placeholder="搜索任务或分类…" value={query} onChange={e => setQuery(e.target.value)} />
          {shown.map(t => <div key={t.id} className={`full-task ${t.done ? 'done' : ''}`}><button className="check" aria-label={`${t.done ? '取消完成' : '完成'} ${t.label}`} onClick={() => toggleTask(t.id)}>{t.done ? '✓' : ''}</button><div><strong>{t.label}</strong><span>{t.tag} · {t.date}{!t.done && t.date < today ? ' · 待续' : ''}</span></div><div className="inline-actions"><button onClick={() => setTaskEditor(t)} aria-label={`编辑 ${t.label}`}>编辑</button><button onClick={() => remove('task',t.id)} aria-label={`删除 ${t.label}`}>删除</button></div></div>)}{!shown.length && <Empty text="没有符合条件的任务。" />}
        </section></div>}
      {active === '习惯' && <div className="view-stack"><Intro kicker="不求完美，只求继续" title="微小行动，也在塑造你" detail={`当前 ${habits.length} 个日常习惯`} action={<button className="primary-button" onClick={() => setHabitEditor('new')}>+ 新习惯</button>} />
        <WeekPicker dates={dates} offset={weekOffset} onChange={setWeekOffset}/><section className="large-card habit-table"><div className="habit-table-head"><span>习惯</span>{dates.map((d,i) => <span key={d}>{weekdays[i]}<br/>{d.slice(5)}</span>)}</div>
          {shownHabits.map(h => <div className="habit-table-row" key={h.id}><div className="habit-name"><div><strong>{h.name}{h.archivedOn ? '（已归档）' : ''}</strong><small>连续 {streak(h,today)} 天</small><div className="inline-actions"><button onClick={() => setHabitEditor(h)}>编辑</button>{!h.archivedOn && <button onClick={() => remove('habit',h.id)}>归档</button>}</div></div></div>{dates.map((d,i) => <button key={d} className={`day-check ${h.checks.includes(d) ? 'checked' : ''}`} aria-label={`${h.name} ${d} 星期${weekdays[i]}`} aria-pressed={h.checks.includes(d)} disabled={d > today || d < h.createdOn || !!(h.archivedOn && d > h.archivedOn)} onClick={() => checkHabit(h.id,d)}>{h.checks.includes(d) ? '✓' : ''}</button>)}</div>)}{!shownHabits.length && <Empty text="这一周还没有习惯记录。" />}
        </section><p className="hint-text">可补记已创建习惯的过去日期；未来日期不可打卡。归档会保留历史记录。</p>
        {data.habits.some(h => h.legacyDays) && <details className="large-card"><summary>旧版未标日期的勾选（不计入统计）</summary>{data.habits.filter(h => h.legacyDays).map(h => <p key={h.id}>{h.name}：{h.legacyDays!.map((done,i) => `周${weekdays[i]} ${done ? '✓' : '—'}`).join('　')}</p>)}</details>}
      </div>}
      {active === '目标' && <div className="view-stack"><Intro kicker="长期主义" title="不着急，但始终朝着它走" detail={`${goals.filter(g => g.progress < 100).length} 个进行中 · ${goals.filter(g => g.progress === 100).length} 个已完成`} action={<button className="primary-button" onClick={() => setGoalEditor('new')}>+ 新目标</button>} />
        <div className="goal-grid">{goals.map((g,i) => <article className="goal-card" key={g.id}><div className="goal-orb" style={{background:`conic-gradient(${['#d8ef78','#efb873','#9fc4b0'][i%3]} ${g.progress}%, #edeee7 0)`}}><span>{g.progress}%</span></div><span className="section-kicker">{g.progress === 100 ? '已完成 ✓' : '进行中'}</span><h3>{g.name}</h3><p>{g.deadline ? `${g.deadline} 前${g.deadline < today && g.progress < 100 ? ' · 已到期' : ''}` : '按自己的节奏推进'}</p><div className="goal-progress"><span style={{width:`${g.progress}%`,background:'#b8d26c'}}/></div><div className="goal-actions"><button disabled={g.progress===0} onClick={() => update(d => ({...d,goals:d.goals.map(x => x.id===g.id ? {...x,progress:Math.max(0,x.progress-5)} : x)}))}>− 5%</button><button disabled={g.progress===100} onClick={() => update(d => ({...d,goals:d.goals.map(x => x.id===g.id ? {...x,progress:Math.min(100,x.progress+5)} : x)}))}>+ 5%</button><button onClick={() => setGoalEditor(g)}>编辑</button><button onClick={() => remove('goal',g.id)}>归档</button></div></article>)}</div>{!goals.length && <Empty text="给未来的自己设定一个小目标。" />}
        {data.goals.some(g => g.archived) && <details className="large-card"><summary>已归档目标</summary>{data.goals.filter(g => g.archived).map(g => <p key={g.id}>{g.name} · {g.progress}% <button onClick={() => update(d => ({...d,goals:d.goals.map(x => x.id===g.id ? {...x,archived:false}:x)}))}>恢复</button></p>)}</details>}
      </div>}
      {active === '回顾' && <div className="view-stack"><section className="review-hero"><span className="section-kicker">每一次完成，都值得看见</span><h2>回头看看，<br/>你已经走过的路。</h2><p>这里的每一个数字，都来自你的真实记录。</p></section><WeekPicker dates={dates} offset={weekOffset} onChange={setWeekOffset}/><div className="stat-grid"><article><span>完成任务</span><strong>{stats.completed}<small> 件</small></strong><em>按实际完成日期统计</em></article><article><span>专注时间</span><strong>{Math.round(stats.seconds/60)}<small> 分钟</small></strong><em>已完成的专注轮次</em></article><article><span>习惯打卡</span><strong>{stats.checks}<small> 次</small></strong><em>{stats.rate === null ? '暂无可统计的习惯' : `${stats.rate}% 完成率（截至当天）`}</em></article></div><section className="large-card"><Heading kicker="专注记录" title="一周的专注节奏"/><Bars values={stats.bars} dates={dates}/><p className="muted">单位为分钟。没有记录的日期显示 0，不填充示例数据。</p></section>{data.tasks.some(t => t.done && !t.completedAt) && <p className="hint-text">旧版已完成任务没有完成日期，保留在任务中，不计入周报。</p>}</div>}
      {active === '设置' && <Settings data={data} cloud={!!client} email={user?.email} update={update} message={setToast} dirty={store.dirty} signingOut={signingOut} signOut={signOut}/>}</section>
    {taskEditor && <TaskEditor initial={taskEditor==='new' ? null : taskEditor} today={today} close={() => setTaskEditor(null)} save={task => {update(d => ({...d,tasks:d.tasks.some(t => t.id===task.id) ? d.tasks.map(t => t.id===task.id ? task:t) : [...d.tasks,task]}));setTaskEditor(null);setToast('任务已记录');}}/>}
    {habitEditor && <HabitEditor initial={habitEditor==='new' ? null : habitEditor} today={today} close={() => setHabitEditor(null)} save={habit => {update(d => ({...d,habits:d.habits.some(h => h.id===habit.id) ? d.habits.map(h => h.id===habit.id ? habit:h) : [...d.habits,habit]}));setHabitEditor(null);setToast('习惯已保存');}}/>}
    {goalEditor && <GoalEditor initial={goalEditor==='new' ? null : goalEditor} close={() => setGoalEditor(null)} save={goal => {update(d => ({...d,goals:d.goals.some(g => g.id===goal.id) ? d.goals.map(g => g.id===goal.id ? goal:g) : [...d.goals,goal]}));setGoalEditor(null);setToast('目标已保存');}}/>}
    {toast && <div className="toast" role="status">{toast}</div>}
  </main>;
}

export function Heading({kicker,title,action}: {kicker:string;title:string;action?:ReactNode}) {return <div className="card-heading"><div><span className="section-kicker">{kicker}</span><h3>{title}</h3></div>{action}</div>;}
export function Intro({kicker,title,detail,action}: {kicker:string;title:string;detail:string;action?:ReactNode}) {return <section className="view-intro"><div><span className="section-kicker">{kicker}</span><h2>{title}</h2><p>{detail}</p></div>{action}</section>;}
function Empty({text}: {text:string}) {return <div className="empty-state"><span>○</span><p>{text}</p></div>;}
function Bars({values,dates}: {values:number[];dates:string[]}) {const max=Math.max(25,...values);return <div className="week-bars live-bars" aria-label="每日专注分钟数">{values.map((v,i) => <div className="day" key={dates[i]}><small>{Math.round(v)}</small><div className="bar-track"><span style={{height:`${v/max*100}%`}}/></div><em>周{weekdays[i]}</em></div>)}</div>;}
function WeekPicker({dates,offset,onChange}: {dates:string[];offset:number;onChange:(value:number)=>void}) {return <div className="week-picker"><button onClick={() => onChange(offset-1)} aria-label="上一周">← 上一周</button><strong>{dates[0]} — {dates[6]}</strong><button disabled={offset===0} onClick={() => onChange(Math.min(0,offset+1))} aria-label="下一周">下一周 →</button>{offset!==0 && <button onClick={() => onChange(0)}>回到本周</button>}</div>;}
function FocusCard({focus}: {focus:ReturnType<typeof useFocus>}) {
  const clock=`${String(Math.floor(focus.seconds/60)).padStart(2,'0')}:${String(focus.seconds%60).padStart(2,'0')}`;
  return <section className="focus-card"><div className="focus-copy"><span className="pill">{focus.running ? '正在专注' : '留一段时间给重要的事'}</span><h2>此刻，只做<br/>这一件事。</h2><p>慢一点，把注意力留给真正重要的事。</p><div className="focus-controls"><button className="focus-button" onClick={focus.toggle}>{focus.running ? '暂停一下' : focus.seconds<focus.minutes*60 ? '继续专注' : '开始专注'} →</button><button className="reset-button" onClick={() => {if ((focus.seconds===focus.minutes*60 && !focus.running) || confirm('结束当前这一轮并重置？未完成的轮次不会计入统计。')) focus.reset();}}>重置</button></div><label className="duration-label">每轮时长<select value={focus.minutes} disabled={focus.running || focus.seconds!==focus.minutes*60} onChange={e => focus.reset(Number(e.target.value))}>{[5,15,25,45,60].map(n => <option key={n} value={n}>{n} 分钟</option>)}</select></label>{focus.error && <p role="status">{focus.error}</p>}</div><div className={`focus-orbit ${focus.running ? 'is-running' : ''}`} aria-label={`剩余 ${clock}`}><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="focus-core"><strong className="clock-value">{clock}</strong><span>{focus.running ? '专注中' : '准备好就开始'}</span></div></div></section>;
}
