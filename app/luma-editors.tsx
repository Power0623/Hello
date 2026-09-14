'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { dateKey, migrateLegacy, parseData, uid, type Goal, type Habit, type LumaData, type Task } from './luma-model';
import { downloadBackup } from './use-luma';

function Modal({title,close,children}: {title:string;close:()=>void;children:ReactNode}) {
  const ref=useRef<HTMLElement>(null), onClose=useRef(close); onClose.current=close;
  useEffect(() => {
    const previous=document.activeElement as HTMLElement|null;
    ref.current?.querySelector<HTMLElement>('input,button')?.focus();
    const keys=(e:KeyboardEvent) => {
      if(e.key==='Escape') onClose.current();
      if(e.key!=='Tab') return;
      const nodes=Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)')??[]);
      const first=nodes[0],last=nodes[nodes.length-1];
      if(e.shiftKey && document.activeElement===first){e.preventDefault();last?.focus();}
      else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first?.focus();}
    };
    window.addEventListener('keydown',keys);
    return () => {window.removeEventListener('keydown',keys);previous?.focus();};
  },[]);
  return <div className="modal-backdrop" onMouseDown={e => {if(e.target===e.currentTarget)close();}}><section ref={ref} className="capture-modal" role="dialog" aria-modal="true" aria-labelledby="editor-title"><h2 id="editor-title">{title}</h2>{children}<button className="modal-close" onClick={close} aria-label="关闭">×</button></section></div>;
}
export function TaskEditor({initial,today,save,close}: {initial:Task|null;today:string;save:(t:Task)=>void;close:()=>void}) {
  const [label,setLabel]=useState(initial?.label??''),[tag,setTag]=useState(initial?.tag??'生活'),[date,setDate]=useState(initial?.date??today);
  return <Modal title={initial?'编辑任务':'脑子里有什么？'} close={close}><form className="editor" onSubmit={e=>{e.preventDefault();if(!label.trim())return;save({id:initial?.id??uid(),label:label.trim(),tag:tag.trim()||'生活',date,done:initial?.done??false,completedAt:initial?.completedAt??null,deletedAt:null});}}><label>任务<input autoFocus required maxLength={60} value={label} onChange={e=>setLabel(e.target.value)} placeholder="例如：给爸妈打个电话"/></label><label>分类<input list="task-tags" maxLength={30} value={tag} onChange={e=>setTag(e.target.value)}/><datalist id="task-tags">{['生活','成长','深度工作'].map(t=><option key={t} value={t}/>)}</datalist></label><label>计划日期<input type="date" required value={date} onChange={e=>setDate(e.target.value)}/></label><button className="submit-capture">保存任务 →</button></form></Modal>;
}
export function HabitEditor({initial,today,save,close}: {initial:Habit|null;today:string;save:(h:Habit)=>void;close:()=>void}) {
  const [name,setName]=useState(initial?.name??'');
  return <Modal title={initial?'编辑习惯':'从一件小事开始'} close={close}><form className="editor" onSubmit={e=>{e.preventDefault();if(!name.trim())return;save(initial?{...initial,name:name.trim()}:{id:uid(),name:name.trim(),createdOn:today,archivedOn:null,checks:[]});}}><label>习惯名称<input autoFocus required maxLength={40} value={name} onChange={e=>setName(e.target.value)} placeholder="例如：每天阅读 20 分钟"/></label><p className="muted">每天打卡一次，从创建当天开始记录。</p><button className="submit-capture">保存习惯 →</button></form></Modal>;
}
export function GoalEditor({initial,save,close}: {initial:Goal|null;save:(g:Goal)=>void;close:()=>void}) {
  const [name,setName]=useState(initial?.name??''),[deadline,setDeadline]=useState(initial?.deadline??''),[progress,setProgress]=useState(initial?.progress??0);
  return <Modal title={initial?'编辑目标':'你想走向哪里？'} close={close}><form className="editor" onSubmit={e=>{e.preventDefault();if(!name.trim()||!Number.isFinite(progress))return;save({id:initial?.id??uid(),name:name.trim(),deadline,progress:Math.min(100,Math.max(0,progress)),archived:initial?.archived??false});}}><label>目标名称<input autoFocus required maxLength={60} value={name} onChange={e=>setName(e.target.value)}/></label><label>截止日期（选填）<input type="date" value={deadline} onChange={e=>setDeadline(e.target.value)}/></label><label>当前进度（0—100%）<input type="number" required min={0} max={100} step={1} value={progress} onChange={e=>setProgress(Number(e.target.value))}/></label><button className="submit-capture">保存目标 →</button></form></Modal>;
}

export function Settings({data,cloud,email,update,message,dirty,signingOut,signOut}: {data:LumaData;cloud:boolean;email?:string;update:(fn:(d:LumaData)=>LumaData)=>void;message:(s:string)=>void;dirty:boolean;signingOut:boolean;signOut:()=>void}) {
  const [name,setName]=useState(data.profile.name),[pending,setPending]=useState<LumaData|null>(null),[fileError,setFileError]=useState('');
  async function readBackup(file?:File) {
    if(!file)return;setFileError('');
    try{if(file.size>5000000)throw new Error('备份超过 5MB，请选择较小的文件。');const raw=JSON.parse(await file.text());setPending(parseData(raw?.format==='luma-backup'?raw.data:raw));}
    catch(e){setPending(null);setFileError(e instanceof Error?e.message:'备份无法读取。');}
  }
  return <div className="view-stack"><section className="view-intro"><div><span className="section-kicker">个人与数据</span><h2>让这个空间，更像你</h2><p>{cloud?`当前账号：${email??''}`:'此版本使用当前浏览器的本地记录，云同步尚未配置。'}</p></div></section>
    <section className="large-card"><h3>希望怎么称呼你？</h3><form className="editor settings-form" onSubmit={e=>{e.preventDefault();if(!name.trim())return;update(d=>({...d,profile:{name:name.trim()}}));message('名字已更新');}}><label>名字<input required maxLength={40} value={name} onChange={e=>setName(e.target.value)} placeholder="输入你的名字"/></label><button className="primary-button">保存名字</button></form></section>
    <section className="large-card"><h3>把自己的记录带走</h3><p className="muted">导出仅包含任务、习惯、目标、专注与名字，不包含登录凭证。导入会替换当前{cloud?'账号':'浏览器'}的记录，请先保留备份。</p><div className="inline-actions"><button onClick={()=>downloadBackup(data)}>导出 JSON 备份</button><label className="file-label">选择备份导入<input type="file" accept="application/json,.json" onChange={e=>{void readBackup(e.target.files?.[0]);e.target.value='';}}/></label></div>{fileError&&<p role="alert">{fileError}</p>}
      {pending&&<div className="import-preview"><p>待导入：{pending.tasks.length} 条任务、{pending.habits.length} 个习惯、{pending.goals.length} 个目标、{pending.focus.length} 条专注记录。名字：{pending.profile.name||'未填写'}。</p><button disabled={dirty} onClick={()=>{downloadBackup(data);update(()=>pending);setName(pending.profile.name);setPending(null);message('已导入；替换前的备份已开始下载，请保留。');}}>备份当前数据并确认替换</button><button onClick={()=>setPending(null)}>取消</button></div>}
      {cloud&&<><p className="muted">新账号不会自动读取此浏览器的旧数据。如果旧记录属于你，可以先预览，再确认导入自己的账号。</p><button onClick={()=>{try{const raw=localStorage.getItem('luma-data-v2'),legacy=localStorage.getItem('luma-data');if(!raw&&!legacy)throw new Error('此浏览器没有旧版记录。');setPending(raw?parseData(JSON.parse(raw)):migrateLegacy(JSON.parse(legacy!),dateKey()));setFileError('');}catch(e){setFileError(e instanceof Error?e.message:'旧记录无法读取。');}}}>预览此浏览器的旧记录</button></>}
    </section>
    <section className="large-card"><h3>{cloud?'属于你的账号':'当前仍为本地版本'}</h3><p className="muted">{cloud?'任务等记录按账号保存在云端。使用另一台设备登录同一邮箱可以读取；进入编辑前可重新载入获取最新版本。专注中的计时保留在发起它的浏览器，完成记录保存到账号。':'记录保存在当前浏览器，清理网站数据可能导致丢失。完成账号服务配置后，才会开启真实登录和云同步。'}</p>{cloud&&<button disabled={dirty||signingOut} onClick={signOut}>{signingOut?'正在退出…':dirty?'请先保存或导出未保存修改':'退出登录'}</button>}</section>
  </div>;
}
