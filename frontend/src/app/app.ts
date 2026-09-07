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
