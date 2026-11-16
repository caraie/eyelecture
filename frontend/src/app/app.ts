import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {
  private readonly auth = inject(AuthService);

  constructor() {
    this.watchForRestoredPages();
    this.swallowStrayFileDrops();
  }

  /**
   * A file dropped anywhere the app is not expecting one does nothing.
   *
   * The browser's default is to navigate to the dropped file and display it,
   * which throws away whatever was on screen — a lecture form filled in but
   * not saved, most of the time. Missing the upload slot by a few pixels
   * should cost nothing.
   *
   * Only drags that carry files. Cancelling every drop would also stop
   * somebody dropping selected text into a textarea, which is a perfectly
   * good thing to do and has nothing to do with uploads.
   */
  private swallowStrayFileDrops(): void {
    const carriesFiles = (event: DragEvent): boolean =>
      Array.from(event.dataTransfer?.types ?? []).includes('Files');

    for (const name of ['dragover', 'drop'] as const) {
      window.addEventListener(name, (event: DragEvent) => {
        if (carriesFiles(event)) event.preventDefault();
      });
    }
  }

  /**
   * Re-syncs after the browser restores a page from the back/forward cache.
   *
   * A restored page is the old JavaScript heap put back as it was: the app does not
   * boot, so no route guard runs and the session held in memory is whatever it was
   * when the page was left. Pressing Back out of signup lands on the signup form
   * again — an empty one, from before the account existed — while the account is
   * real and signed in, which is exactly how somebody ends up with a half-finished
   * profile they cannot reach.
   *
   * Reloading only when the two views actually disagree, rather than on every
   * restore, keeps the common Back — where nothing changed — instant.
   */
  private watchForRestoredPages(): void {
    window.addEventListener('pageshow', (event: PageTransitionEvent) => {
      if (!event.persisted) return;

      const hasToken = this.auth.accessToken !== null;
      if (hasToken !== this.auth.isAuthenticated()) location.reload();
    });
  }
}
