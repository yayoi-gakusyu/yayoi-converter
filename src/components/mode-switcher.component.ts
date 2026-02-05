
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModeService } from '../services/mode.service';
import { MODE_CONFIGS } from '../mode.types';
import { AppMode } from '../types';

@Component({
  selector: 'app-mode-switcher',
  imports: [CommonModule],
  template: `
    <div class="flex rounded-xl overflow-hidden border border-white/20 shadow-lg bg-white/10 backdrop-blur-sm">
      @for (m of modes; track m.mode) {
        <button
          (click)="modeService.switchMode(m.mode)"
          [class.bg-white]="modeService.activeMode() === m.mode"
          [class.text-slate-800]="modeService.activeMode() === m.mode"
          [class.shadow-md]="modeService.activeMode() === m.mode"
          [class.font-bold]="modeService.activeMode() === m.mode"
          [class.text-white/80]="modeService.activeMode() !== m.mode"
          [class.hover:bg-white/20]="modeService.activeMode() !== m.mode"
          class="flex-1 py-3 px-4 text-sm transition-all duration-300 flex items-center justify-center gap-2 whitespace-nowrap">
          <span>{{ m.icon }}</span>
          <span>{{ m.label }}</span>
        </button>
      }
    </div>
  `
})
export class ModeSwitcherComponent {
  modeService = inject(ModeService);
  modes = [MODE_CONFIGS['creditcard'], MODE_CONFIGS['bank'], MODE_CONFIGS['receipt']];
}
