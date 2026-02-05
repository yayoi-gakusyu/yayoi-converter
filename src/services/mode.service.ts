
import { Injectable, signal, computed, effect, inject } from '@angular/core';
import { AppMode } from '../types';
import { ModeConfig, MODE_CONFIGS } from '../mode.types';
import { CreditCardLogicService } from './creditcard-logic.service';
import { BankLogicService } from './bank-logic.service';
import { ReceiptLogicService } from './receipt-logic.service';

@Injectable({ providedIn: 'root' })
export class ModeService {
  private ccLogic = inject(CreditCardLogicService);
  private bankLogic = inject(BankLogicService);
  private receiptLogic = inject(ReceiptLogicService);

  activeMode = signal<AppMode>(
    (localStorage.getItem('unified_activeMode') as AppMode) || 'creditcard'
  );

  modeConfig = computed<ModeConfig>(() => MODE_CONFIGS[this.activeMode()]);

  activeService = computed(() => {
    switch (this.activeMode()) {
      case 'creditcard': return this.ccLogic;
      case 'bank':       return this.bankLogic;
      case 'receipt':    return this.receiptLogic;
    }
  });

  constructor() {
    effect(() => {
      localStorage.setItem('unified_activeMode', this.activeMode());
    });
  }

  switchMode(mode: AppMode) {
    this.activeMode.set(mode);
  }
}
