import { Component, Input, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-image-viewer',
  imports: [CommonModule],
  template: `
    <div class="flex flex-col h-full bg-slate-900 rounded-xl overflow-hidden border border-slate-700 shadow-inner">
      <!-- Toolbar -->
      <div class="flex items-center justify-between p-2 bg-slate-800 text-slate-300 border-b border-slate-700 z-10">
        <div class="flex items-center gap-2">
          <button (click)="zoomOut()" class="p-1 hover:bg-slate-700 rounded hover:text-white transition-colors" title="Zoom Out">
             ➖
          </button>
          <span class="text-xs font-mono w-12 text-center">{{ scalePercent() }}%</span>
          <button (click)="zoomIn()" class="p-1 hover:bg-slate-700 rounded hover:text-white transition-colors" title="Zoom In">
             ➕
          </button>
          <button (click)="resetZoom()" class="text-xs bg-slate-700 hover:bg-slate-600 px-2 py-1 rounded ml-2 text-slate-200">
             Reset
          </button>
        </div>
        
        <!-- Pagination -->
        @if (images.length > 1) {
          <div class="flex items-center gap-2">
            <button (click)="prevPage()" [disabled]="currentIndex() === 0" 
                    class="p-1 hover:bg-slate-700 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
              ◀
            </button>
            <span class="text-xs font-mono">{{ currentIndex() + 1 }} / {{ images.length }}</span>
            <button (click)="nextPage()" [disabled]="currentIndex() === images.length - 1"
                    class="p-1 hover:bg-slate-700 rounded disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
              ▶
            </button>
          </div>
        }
      </div>

      <!-- Viewport -->
      <div class="relative flex-1 overflow-hidden cursor-grab active:cursor-grabbing bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTEgMWgydjJIMUMxeiIgZmlsbD0iIzMzMyIgZmlsbC1vcGFjaXR5PSIwLjEiLz48L3N2Zz4=')]"
           (wheel)="onWheel($event)"
           (mousedown)="startDrag($event)">
        
        <div class="absolute inset-0 flex items-center justify-center transform-origin-center transition-transform duration-75 ease-out"
             [style.transform]="transformStyle()">
             
           @if (currentImage(); as page) {
             <img [src]="page.image" 
                  class="max-w-none shadow-2xl"
                  [style.transform]="'rotate(' + page.rotation + 'deg)'"
                  [style.max-height]="'90%'"
                  draggable="false"
                  (load)="onImageLoad($event)">
           }
        </div>

        <div class="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] px-2 py-1 rounded pointer-events-none backdrop-blur-sm">
           Scroll to Zoom • Drag to Pan
        </div>
      </div>
    </div>
  `
})
export class ImageViewerComponent {
  @Input() images: { id: string, image: string, rotation: number }[] = [];

  currentIndex = signal(0);
  scale = signal(1);
  panX = signal(0);
  panY = signal(0);
  isDragging = false;
  startX = 0;
  startY = 0;

  currentImage = computed(() => this.images[this.currentIndex()] || null);
  scalePercent = computed(() => Math.round(this.scale() * 100));

  transformStyle = computed(() => 
    `translate(${this.panX()}px, ${this.panY()}px) scale(${this.scale()})`
  );

  onImageLoad(e: Event) {
      // Reset zoom/pan when image changes or loads? 
      // Ideally handled in effect when currentIndex changes
  }

  constructor() {
      // Reset view when page changes
      effect(() => {
          this.currentIndex(); // dependency
          this.resetZoom();
      }, { allowSignalWrites: true });
  }

  prevPage() {
    if (this.currentIndex() > 0) this.currentIndex.update(i => i - 1);
  }

  nextPage() {
    if (this.currentIndex() < this.images.length - 1) this.currentIndex.update(i => i + 1);
  }

  zoomIn() {
    this.scale.update(s => Math.min(s * 1.2, 5));
  }

  zoomOut() {
    this.scale.update(s => Math.max(s / 1.2, 0.5));
  }

  resetZoom() {
    this.scale.set(1);
    this.panX.set(0);
    this.panY.set(0);
  }

  onWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    this.scale.update(s => Math.min(Math.max(s * delta, 0.5), 5));
  }

  startDrag(e: MouseEvent) {
    e.preventDefault();
    this.isDragging = true;
    this.startX = e.clientX - this.panX();
    this.startY = e.clientY - this.panY();

    const moveHandler = (moveEvent: MouseEvent) => {
        if (!this.isDragging) return;
        this.panX.set(moveEvent.clientX - this.startX);
        this.panY.set(moveEvent.clientY - this.startY);
    };

    const upHandler = () => {
        this.isDragging = false;
        window.removeEventListener('mousemove', moveHandler);
        window.removeEventListener('mouseup', upHandler);
    };

    window.addEventListener('mousemove', moveHandler);
    window.addEventListener('mouseup', upHandler);
  }
}
