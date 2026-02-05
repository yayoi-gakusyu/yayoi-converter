import { Injectable, signal, computed } from '@angular/core';
import { Transaction } from '../types';

@Injectable({
  providedIn: 'root'
})
export class HistoryService {
  private historyStack = signal<Transaction[][]>([]);
  private readonly MAX_HISTORY = 50;

  canUndo = computed(() => this.historyStack().length > 0);

  /**
   * Saves the current state to history.
   * Should be called BEFORE modifying the state.
   */
  push(currentState: Transaction[]) {
    // Deep copy to prevent reference issues
    const snapshot = JSON.parse(JSON.stringify(currentState));
    
    this.historyStack.update(stack => {
      const newStack = [snapshot, ...stack];
      return newStack.length > this.MAX_HISTORY 
        ? newStack.slice(0, this.MAX_HISTORY) 
        : newStack;
    });
  }

  /**
   * Restores the most recent state from history.
   * Returns the state to revert to, or null if no history.
   */
  undo(): Transaction[] | null {
    const stack = this.historyStack();
    if (stack.length === 0) return null;

    const [previousState, ...remaining] = stack;
    this.historyStack.set(remaining);
    
    return previousState;
  }

  clear() {
    this.historyStack.set([]);
  }
}
