import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { NotificationService } from '../../core/services/notification.service';

/**
 * Reads a lecture's presentation one slide at a time, inside the app.
 *
 * pdf.js is loaded on demand rather than bundled with the shell: it is the
 * heaviest dependency in the project and nobody who is not looking at a lecture
 * should pay for it. The worker comes from the same package, as a module
 * worker, so the heavy parsing stays off the main thread and the page keeps
 * responding while a 200-page deck renders.
 *
 * Rendering is to a canvas at the container's own width, re-run when the slide
 * changes. Each render cancels the one before it: holding the arrow key down
 * otherwise queues a dozen renders of pages nobody is waiting for any more.
 */
@Component({
  selector: 'el-slide-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatButtonModule, MatProgressSpinnerModule],
  template: `
    <div class="viewer" #frame>
      @if (loading()) {
        <div class="state"><mat-spinner diameter="28" /></div>
      } @else if (error()) {
        <div class="state err">
          <mat-icon>error_outline</mat-icon>
          <p>{{ error() }}</p>
        </div>
      }

      <canvas #canvas [class.hidden]="loading() || error()"></canvas>

      @if (!loading() && !error()) {
        <div class="bar">
          <button
            mat-icon-button
            type="button"
            aria-label="Previous slide"
            [disabled]="page() <= 1"
            (click)="go(-1)"
          >
            <mat-icon>chevron_left</mat-icon>
          </button>

          <span class="count">{{ page() }} / {{ total() }}</span>

          <button
            mat-icon-button
            type="button"
            aria-label="Next slide"
            [disabled]="page() >= total()"
            (click)="go(1)"
          >
            <mat-icon>chevron_right</mat-icon>
          </button>

          <button
            mat-icon-button
            type="button"
            class="full"
            [attr.aria-label]="isFullscreen() ? 'Leave fullscreen' : 'Fullscreen'"
            (click)="toggleFullscreen()"
          >
            <mat-icon>{{ isFullscreen() ? 'fullscreen_exit' : 'fullscreen' }}</mat-icon>
          </button>
        </div>
      }
    </div>
  `,
  styleUrl: './slide-viewer.component.scss',
  host: {
    '(keydown.arrowleft)': 'go(-1)',
    '(keydown.arrowright)': 'go(1)',
    tabindex: '0',
  },
})
export class SlideViewerComponent implements OnDestroy {
  private readonly notify = inject(NotificationService);

  /** A short-lived link to the PDF, issued by the API. */
  readonly src = input.required<string>();

  readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  readonly frame = viewChild.required<ElementRef<HTMLElement>>('frame');

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly isFullscreen = signal(false);

  private document_: { numPages: number; getPage(n: number): Promise<unknown> } | null =
    null;
  private renderTask: { cancel(): void } | null = null;

  readonly canTurn = computed(() => this.total() > 1);

  constructor() {
    effect(() => {
      const url = this.src();
      if (url) void this.load(url);
    });

    effect(() => {
      const page = this.page();
      if (this.document_) void this.render(page);
    });
  }

  ngOnDestroy(): void {
    this.renderTask?.cancel();
  }

  go(delta: number): void {
    const next = this.page() + delta;
    if (next >= 1 && next <= this.total()) this.page.set(next);
  }

  async toggleFullscreen(): Promise<void> {
    const frame = this.frame().nativeElement;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      this.isFullscreen.set(false);
    } else {
      await frame.requestFullscreen();
      this.isFullscreen.set(true);
      // The canvas is sized from the container, which just changed.
      void this.render(this.page());
    }
  }

  private async load(url: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const pdfjs = await import('pdfjs-dist');
      // Copied to the output root by angular.json rather than resolved from
      // the package here. `new URL('pdfjs-dist/...', import.meta.url)` looks
      // right but esbuild does not rewrite a bare specifier, so in a built app
      // it pointed at a path nginx answers with index.html: pdf.js fell back
      // to its "fake worker", and that then failed on its own dynamic import.
      // The symptom was every deck reporting "could not be opened".
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

      const task = pdfjs.getDocument({ url });
      const doc = await task.promise;

      this.document_ = doc as unknown as typeof this.document_;
      this.total.set(doc.numPages);
      this.page.set(1);
      this.loading.set(false);
      await this.render(1);
    } catch (cause) {
      this.loading.set(false);
      this.error.set('This presentation could not be opened.');
      // The screen says something a reader can act on; the console keeps what
      // somebody debugging actually needs. Swallowing the cause entirely is
      // what made the worker fault above take a round of guessing to find.
      console.error('Slide viewer could not open the PDF', cause);
      this.notify.showHttpError(cause, 'This presentation could not be opened');
    }
  }

  private async render(pageNumber: number): Promise<void> {
    const doc = this.document_;
    const canvas = this.canvas()?.nativeElement;
    if (!doc || !canvas) return;

    this.renderTask?.cancel();

    const page = (await doc.getPage(pageNumber)) as {
      getViewport(options: { scale: number }): { width: number; height: number };
      render(options: object): { promise: Promise<void>; cancel(): void };
    };

    const width = this.frame().nativeElement.clientWidth || 800;
    const base = page.getViewport({ scale: 1 });
    const scale = width / base.width;
    const viewport = page.getViewport({ scale });

    // Render at the device's pixel density, or the text is soft on a laptop
    // screen — which is the whole difference between reading slides and
    // squinting at them.
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    const context = canvas.getContext('2d');
    if (!context) return;

    const task = page.render({
      canvasContext: context,
      viewport,
      transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
    });
    this.renderTask = task;

    try {
      await task.promise;
    } catch {
      // A cancelled render is the normal result of turning the page quickly.
    }
  }
}
