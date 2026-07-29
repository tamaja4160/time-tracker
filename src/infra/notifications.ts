/**
 * Browser notification helper (infrastructure layer).
 *
 * A thin, guarded wrapper over the Web Notifications API so the UI can surface
 * an OS-level notification when a session completes. Everything is feature-
 * detected: in environments without `Notification` (e.g. jsdom under tests, or
 * older browsers) the helper degrades to no-ops and reports `'unsupported'`,
 * so callers never need to guard themselves.
 *
 * The standard page Notification API does NOT support inline text-reply fields
 * (that exists only for Service-Worker push notifications on some platforms),
 * so the completion notification instead invites the user to click it, which
 * focuses the window where the in-app activity prompt is shown.
 */

export type NotificationPermissionState =
  | 'granted'
  | 'denied'
  | 'default'
  | 'unsupported';

export interface Notifier {
  /** Whether the Notifications API is available in this environment. */
  isSupported(): boolean;
  /** Current permission, or `'unsupported'` when the API is absent. */
  permission(): NotificationPermissionState;
  /** Request permission (no-op when unsupported or already decided). */
  requestPermission(): Promise<NotificationPermissionState>;
  /**
   * Show a notification when permission is granted. Returns a handle with a
   * `close()` method, or `null` when not shown (unsupported / not granted).
   * Clicking the notification focuses the current window.
   */
  notify(
    title: string,
    options?: NotificationOptions,
  ): { close: () => void } | null;
}

/** True when the Notifications API exists in this environment. */
function notificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Create a browser-backed {@link Notifier}. Safe to construct anywhere; all
 * methods feature-detect at call time.
 */
export function createBrowserNotifier(): Notifier {
  return {
    isSupported: notificationSupported,

    permission(): NotificationPermissionState {
      if (!notificationSupported()) return 'unsupported';
      return Notification.permission;
    },

    async requestPermission(): Promise<NotificationPermissionState> {
      if (!notificationSupported()) return 'unsupported';
      // Already decided — don't re-prompt.
      if (Notification.permission !== 'default') {
        return Notification.permission;
      }
      try {
        return await Notification.requestPermission();
      } catch {
        // Some browsers reject if not triggered by a user gesture.
        return Notification.permission;
      }
    },

    notify(title, options) {
      if (!notificationSupported() || Notification.permission !== 'granted') {
        return null;
      }
      try {
        const notification = new Notification(title, options);
        notification.onclick = () => {
          try {
            window.focus();
          } finally {
            notification.close();
          }
        };
        return { close: () => notification.close() };
      } catch {
        return null;
      }
    },
  };
}

/** A no-op notifier for tests or when notifications should be disabled. */
export function createNoopNotifier(): Notifier {
  return {
    isSupported: () => false,
    permission: () => 'unsupported',
    requestPermission: async () => 'unsupported',
    notify: () => null,
  };
}
