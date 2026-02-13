import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { environment } from '../environments/environment';
import { Rule } from '../types';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;
  private channel: RealtimeChannel | null = null;

  constructor() {
    this.supabase = createClient(environment.supabase.url, environment.supabase.key);
  }


  // Fetch transactions
  async getTransactions(sourceType: string, sourceName?: string): Promise<any[]> {
    let query = this.supabase
      .from('transactions')
      .select('*')
      .eq('source_type', sourceType)
      .order('date', { ascending: false });

    if (sourceName) {
      query = query.eq('source_name', sourceName);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Supabase fetch transactions error:', error);
      return [];
    }
    return data || [];
  }

  // Save (Upsert) a transaction
  async saveTransaction(transaction: any) {
    // Remove undefined fields if any, though Supabase client handles them well usually
    const { error } = await this.supabase
      .from('transactions')
      .upsert(transaction, { onConflict: 'id' });

    if (error) {
      console.error('Supabase save transaction error:', error);
      throw error;
    }
  }

  // Delete a transaction
  async deleteTransaction(id: string) {
    const { error } = await this.supabase
      .from('transactions')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Supabase delete transaction error:', error);
      throw error;
    }
  }

  // Fetch all rules
  async getRules(): Promise<Rule[]> {
    const { data, error } = await this.supabase
      .from('learning_rules')
      .select('*');

    if (error) {
      console.error('Supabase fetch rules error:', error);
      return [];
    }
    return data as Rule[];
  }

  // Upsert a rule
  async saveRule(rule: Rule) {
    const { error } = await this.supabase
      .from('learning_rules')
      .upsert(rule, { onConflict: 'keyword' });

    if (error) {
      console.error('Supabase save rule error:', error);
    }
  }

  // Delete a rule
  async deleteRule(id: string) {
    const { error } = await this.supabase
      .from('learning_rules')
      .delete()
      .eq('id', id);
    
    if (error) {
       // Try deleting by keyword if id is missing? 
       // Start with ID as primary check.
       console.error('Supabase delete rule error:', error);
    }
  }

  // Realtime Subscription
  subscribeToChanges(callback: () => void) {
    this.channel = this.supabase
      .channel('public:db_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transactions' },
        () => callback()
      )
      .on(
         'postgres_changes',
         { event: '*', schema: 'public', table: 'learning_rules' },
         () => callback()
      )
      .subscribe();
  }
}

