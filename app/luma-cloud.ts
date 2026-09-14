import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { emptyData, parseData, type LumaData } from './luma-model';

let cloudPromise: Promise<SupabaseClient | null> | undefined;
export function loadCloud(): Promise<SupabaseClient | null> {
  cloudPromise ??= createCloud();
  return cloudPromise;
}
async function createCloud(): Promise<SupabaseClient | null> {
  const response = await fetch(new URL('./luma-config.json', window.location.href), { cache: 'no-store' });
  if (!response.ok) throw new Error('无法读取账号配置，请刷新重试。');
  const config = await response.json();
  if (!config.supabaseUrl && !config.supabasePublishableKey) return null;
  if (typeof config.supabaseUrl !== 'string' || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(config.supabaseUrl) || typeof config.supabasePublishableKey !== 'string' || !config.supabasePublishableKey.startsWith('sb_publishable_')) {
    throw new Error('账号服务配置不完整，请联系网站维护者。');
  }
  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'luma-auth' },
  });
}

export async function readCloud(client: SupabaseClient, userId: string) {
  const {data, error} = await client.from('luma_states').select('data,revision').eq('user_id', userId).maybeSingle();
  if (error) throw new Error('云端数据读取失败。请检查网络或账号服务配置，现有数据不会被覆盖。');
  return data ? {data: parseData(data.data), revision: data.revision as number} : {data: emptyData(), revision: 0};
}

export async function writeCloud(client: SupabaseClient, data: LumaData, revision: number, userId: string): Promise<number> {
  const result = await client.rpc('luma_save_state', {new_data: data, expected_revision: revision, expected_user: userId});
  if (result.error) {
    if (result.error.message.includes('LUMA_CONFLICT')) throw new Error('另一设备已更新数据。请先导出当前记录，再重新载入云端版本；本次没有覆盖云端。');
    throw new Error('尚未保存到云端，请检查网络后重试。离开前可先导出备份。');
  }
  if (typeof result.data !== 'number') throw new Error('云端保存结果无法确认，请导出备份后重新载入。');
  return result.data;
}
