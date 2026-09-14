import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
// An isolated, in-memory PostgreSQL instance; never connects to a real account.
const db = new PGlite();
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
try {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;`);
  await db.query('insert into auth.users values ($1),($2)',[A,B]);
  await db.exec(readFileSync(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
  async function asUser(id, action) {
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
    try { return await action(); } finally { await db.exec('reset role'); }
  }
  const payload={version:2,profile:{name:'A'},tasks:[],habits:[],goals:[],focus:[]};
  await asUser(A,async()=>{
    assert.equal((await db.query('select public.luma_save_state($1,0,$2) as v',[payload,A])).rows[0].v,1);
    assert.equal((await db.query('select * from public.luma_states')).rows.length,1);
  });
  console.log('PASS: account A can create and read its own record');
  await asUser(B,async()=>{
    assert.equal((await db.query('select * from public.luma_states')).rows.length,0);
    assert.equal((await db.query('update public.luma_states set revision=99 where user_id=$1 returning *',[A])).rows.length,0);
    await assert.rejects(()=>db.query('insert into public.luma_states(user_id,data) values ($1,$2)',[A,payload]),/row-level security/);
    await assert.rejects(()=>db.query('select public.luma_save_state($1,1,$2)',[payload,A]),/LUMA_UNAUTHENTICATED/);
    await db.query('select public.luma_save_state($1,0,$2)',[{...payload,profile:{name:'B'}},B]);
    assert.equal((await db.query('select * from public.luma_states')).rows.length,1);
  });
  console.log('PASS: account B cannot read, modify, insert or save as account A');
  await asUser(A,async()=>{
    assert.equal((await db.query('select public.luma_save_state($1,1,$2) as v',[payload,A])).rows[0].v,2);
    await assert.rejects(()=>db.query('select public.luma_save_state($1,1,$2)',[payload,A]),/LUMA_CONFLICT/);
    await assert.rejects(()=>db.query('select public.luma_save_state($1,0,$2)',[payload,A]),/LUMA_CONFLICT/);
    assert.equal((await db.query('select revision from public.luma_states')).rows[0].revision,2);
  });
  console.log('PASS: stale revisions and duplicate initialization cannot overwrite saved data');
  await db.exec('set role anon');
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await assert.rejects(()=>db.query('select * from public.luma_states'),/permission denied/);
  await assert.rejects(()=>db.query('select public.luma_save_state($1,0,$2)',[payload,A]),/permission denied/);
  await db.exec('reset role');
  console.log('PASS: signed-out visitors cannot read or write account data');
} finally { await db.close(); }
