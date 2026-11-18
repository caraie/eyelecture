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
import { AuthService } from '../../core/services/auth.service';

/** The error in one line, for the panel and for a screenshot of it. */
const describe = (cause: unknown): string | null => {
  const name = (cause as { name?: string })?.name;
  const message = (cause as { message?: string })?.message;
  const status = (cause as { status?: number })?.status;
  const text = [name, message, status ? `(${status})` : null]
    .filter(Boolean)
    .join(': ');
  return text ? text.slice(0, 200) : null;
};

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
          <!-- Small, and deliberately present: a screenshot of this panel
               should be enough to tell us what happened, because the person
               reporting it will not be opening the console. -->
          @if (detail()) {
            <p class="detail">{{ detail() }}</p>
          }
          <button mat-stroked-button type="button" (click)="retry()">
            Try again
          </button>
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
  private readonly auth = inject(AuthService);

  /** Where the API serves the PDF. */
  readonly src = input.required<string>();

  readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  readonly frame = viewChild.required<ElementRef<HTMLElement>>('frame');

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  /** The underlying error, kept on screen rather than only in the console. */
  readonly detail = signal<string | null>(null);
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
    this.detail.set(null);

    try {
      const pdfjs = await import('pdfjs-dist');
      // Copied to the output root by angular.json rather than resolved from
      // the package here. `new URL('pdfjs-dist/...', import.meta.url)` looks
      // right but esbuild does not rewrite a bare specifier, so in a built app
      // it pointed at a path nginx answers with index.html: pdf.js fell back
      // to its "fake worker", and that then failed on its own dynamic import.
      // The symptom was every deck reporting "could not be opened".
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

      // The file comes from our own API now, so the request has to carry the
      // session — a signed URL carried its own permission, this does not.
      //
      // Ranges are off on purpose. pdf.js would otherwise fetch the document
      // in pieces over the whole time somebody is reading it, and a token that
      // expires between slide 4 and slide 5 would break the deck halfway
      // through. One request, one token, at the moment the reader opens it.
      const token = this.auth.accessToken;
      const task = pdfjs.getDocument({
        url,
        httpHeaders: token ? { Authorization: `Bearer ${token}` } : undefined,
        disableRange: true,
        disableStream: true,
      });
      const doc = await task.promise;

      this.document_ = doc as unknown as typeof this.document_;
      this.total.set(doc.numPages);
      this.page.set(1);
      this.loading.set(false);
      await this.render(1);
    } catch (cause) {
      this.loading.set(false);
      this.error.set(this.explain(cause));
      this.detail.set(describe(cause));
      console.error('Slide viewer could not open the PDF', cause);
    }
  }

  retry(): void {
    const url = this.src();
    if (url) void this.load(url);
  }

  /**
   * What to tell the reader.
   *
   * Every failure used to come out as one sentence, which fit them all equally
   * and so told nobody anything. The distinction that matters is whether the
   * file arrived, and now that it comes from our own API rather than from
   * Cloud Storage, a download that fails is the app failing — not a host the
   * reader's network happens to treat differently. See EYE-24.
   */
  private explain(cause: unknown): string {
    const name = (cause as { name?: string })?.name ?? '';
    const message = String((cause as { message?: string })?.message ?? '');
    const status = (cause as { status?: number })?.status ?? 0;

    if (status === 401 || status === 403) {
      return 'Your session may have expired. Sign in again and reopen the lecture.';
    }

    if (status === 404 || name === 'MissingPDFException') {
      return 'The slides for this lecture are no longer where we left them.';
    }

    const neverArrived =
      name === 'UnexpectedResponseException' ||
      /failed to fetch|networkerror|load failed/i.test(message);

    if (neverArrived) {
      return 'The slides could not be downloaded. Check the connection and try again.';
    }

    if (name === 'InvalidPDFException') {
      return 'The slides downloaded but the file could not be read.';
    }

    return 'This presentation could not be opened.';
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
