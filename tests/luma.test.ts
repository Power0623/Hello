import test from 'node:test';
import assert from 'node:assert/strict';
import {addDays,dateKey,emptyData,migrateLegacy,parseData,parseTimer,remainingSeconds,streak,weekDays,weeklyStats,type Habit} from '../app/luma-model';
import {readCloud,writeCloud} from '../app/luma-cloud';
import type {SupabaseClient} from '@supabase/supabase-js';

test('local dates and weeks cross month/year boundaries without UTC shifting',()=>{
  assert.equal(dateKey(new Date(2026,8,14,0,1)),'2026-09-14');
  assert.equal(addDays('2026-12-31',1),'2027-01-01');
  assert.deepEqual(weekDays('2027-01-03'),['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);
  assert.equal(addDays('2024-02-28',1),'2024-02-29');
});
test('legacy migration preserves undated evidence without inventing real history',()=>{
  const old={tasks:[{id:1,label:'旧任务',tag:'生活',done:true}],habits:[{id:1,name:'阅读',days:[true,false,true,false,true,false,true]}],goals:[{id:1,name:'读书',progress:66}]};
  const original=JSON.stringify(old),data=migrateLegacy(old,'2026-09-14');
  assert.equal(data.profile.name,'闫圣强');assert.equal(data.tasks[0].completedAt,null);
  assert.deepEqual(data.habits[0].checks,[]);assert.deepEqual(data.habits[0].legacyDays,old.habits[0].days);
  assert.equal(weeklyStats(data,weekDays('2026-09-14'),'2026-09-14').completed,0);
  assert.equal(JSON.stringify(old),original);
});
test('streak allows today to be incomplete, resets across a missed day',()=>{
  const habit:Habit={id:'a',name:'阅读',createdOn:'2026-09-01',archivedOn:null,checks:['2026-09-11','2026-09-12','2026-09-13']};
  assert.equal(streak(habit,'2026-09-14'),3);assert.equal(streak(habit,'2026-09-15'),0);
  habit.checks.push('2026-09-14');assert.equal(streak(habit,'2026-09-14'),4);
});
test('weekly stats use dated events, retain deleted completions, exclude future denominator',()=>{
  const data=emptyData();
  data.tasks=[{id:'t1',label:'任务',tag:'生活',date:'2026-09-01',done:true,completedAt:new Date(2026,8,14,12).toISOString(),deletedAt:new Date().toISOString()},{id:'t2',label:'旧完成',tag:'生活',date:'2026-09-01',done:true,completedAt:null,deletedAt:null}];
  data.habits=[{id:'h',name:'习惯',createdOn:'2026-09-14',archivedOn:null,checks:['2026-09-14']}];
  data.focus=[{id:'f',completedAt:new Date(2026,8,14,12).toISOString(),seconds:1500}];
  const stats=weeklyStats(data,weekDays('2026-09-14'),'2026-09-14');
  assert.equal(stats.completed,1);assert.equal(stats.rate,100);assert.equal(stats.seconds,1500);assert.deepEqual(stats.bars,[25,0,0,0,0,0,0]);
  assert.equal(weeklyStats(data,weekDays('2026-09-07'),'2026-09-14').completed,0);
});
test('archived habits only contribute scheduled days through archive date',()=>{
  const data=emptyData();data.habits=[{id:'h',name:'散步',createdOn:'2026-09-14',archivedOn:'2026-09-15',checks:['2026-09-14']}];
  assert.equal(weeklyStats(data,weekDays('2026-09-14'),'2026-09-20').rate,50);
});
test('backups reject malformed dates, duplicate IDs, invalid progress and checks',()=>{
  const data=emptyData();data.tasks=[{id:'t',label:'任务',tag:'生活',date:'2026-02-30',done:false,completedAt:null,deletedAt:null}];
  assert.throws(()=>parseData(data));data.tasks[0].date='2026-09-14';assert.equal(parseData(data).tasks.length,1);
  data.tasks.push({...data.tasks[0]});assert.throws(()=>parseData(data));data.tasks.pop();
  data.goals=[{id:'g',name:'目标',deadline:'',progress:101,archived:false}];assert.throws(()=>parseData(data));
  assert.throws(()=>parseData({version:2}));
  const h=emptyData();h.habits=[{id:'h',name:'习惯',createdOn:'2026-09-14',archivedOn:null,checks:['2026-09-13']}];assert.throws(()=>parseData(h));
});
test('import roundtrip retains domain data and strips extra credentials',()=>{
  const data=emptyData('闫圣强');const raw={...data,token:'secret',profile:{name:'闫圣强',token:'secret'}};
  assert.deepEqual(parseData(JSON.parse(JSON.stringify(raw))),data);
});
test('timer uses absolute deadline, pauses precisely, rejects corrupt saved state',()=>{
  const timer={id:'timer',duration:1500,remaining:1500,endsAt:101000};
  assert.equal(remainingSeconds(timer,1000),100);assert.equal(remainingSeconds(timer,102000),0);
  assert.equal(remainingSeconds({...timer,remaining:42,endsAt:null},500000),42);
  assert.equal(parseTimer({...timer,remaining:-1}),null);assert.equal(parseTimer({...timer,duration:Infinity}),null);
});
test('cloud reads are explicitly scoped to the signed-in user; load failure does not yield empty data',async()=>{
  let filter:unknown;
  const fake={from:()=>({select:()=>({eq:(key:string,value:string)=>{filter=[key,value];return{maybeSingle:async()=>({data:null,error:null})};}})})} as unknown as SupabaseClient;
  assert.deepEqual(await readCloud(fake,'user-a'),{data:emptyData(),revision:0});assert.deepEqual(filter,['user_id','user-a']);
  const broken={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({error:{message:'offline'},data:null})})})})} as unknown as SupabaseClient;
  await assert.rejects(()=>readCloud(broken,'user-a'),/读取失败/);
});
test('save carries expected revision, rejects conflicts and unconfirmed writes',async()=>{
  let args:unknown;
  const fake={rpc:async(name:string,payload:unknown)=>{args=[name,payload];return{data:3,error:null};}} as unknown as SupabaseClient;
  assert.equal(await writeCloud(fake,emptyData(),2,'user-a'),3);assert.deepEqual(args,['luma_save_state',{new_data:emptyData(),expected_revision:2,expected_user:'user-a'}]);
  const conflict={rpc:async()=>({data:null,error:{message:'LUMA_CONFLICT'}})} as unknown as SupabaseClient;
  await assert.rejects(()=>writeCloud(conflict,emptyData(),2,'user-a'),/另一设备/);
  const invalid={rpc:async()=>({data:null,error:null})} as unknown as SupabaseClient;
  await assert.rejects(()=>writeCloud(invalid,emptyData(),2,'user-a'),/无法确认/);
});
