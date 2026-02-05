import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { environment } from '../environments/environment';

export interface LearningRule {
  keyword: string; // Primary Key
  account: string;
  sub_account?: string;
  tax_type?: string;
  updated_at?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;
  private channel: RealtimeChannel | null = null;

  constructor() {
    this.supabase = createClient(environment.supabase.url, environment.supabase.key);
  }

  // Fetch all rules on startup
  async getRules(): Promise<LearningRule[]> {
    const { data, error } = await this.supabase
      .from('learning_rules')
      .select('*');

    if (error) {
      console.error('Supabase fetch error:', error);
      return [];
    }
    return data as LearningRule[];
  }

  // Upsert a rule (Insert or Update)
  async saveRule(rule: LearningRule) {
    // Clean undefined fields to avoid issues if needed, but Supabase handles them usually.
    // However, ensure updated_at is handled by DB default or sent.
    // Let's rely on DB default for updated_at if we don't send it, but upsert might need it.
    // Actually simpler to just send payload.
    const { error } = await this.supabase
      .from('learning_rules')
      .upsert(rule, { onConflict: 'keyword' });

    if (error) {
      console.error('Supabase save error:', error);
    }
  }

  // Realtime Subscription
  subscribeToRules(callback: (payload: any) => void) {
    this.channel = this.supabase
      .channel('public:learning_rules')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'learning_rules' },
        (payload) => {
          callback(payload);
        }
      )
      .subscribe();
  }
}
