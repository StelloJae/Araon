/**
 * Thin wrapper around the Web Notifications API.
 *
 * Defaults to "only show when the tab is hidden" — when the dashboard is
 * already visible, the in-app ToastStack already covers the use case and a
 * second OS-level popup just adds noise.
 *
 * Permission requests are NOT made from this module. The user must opt in
 * from SettingsModal's notif tab (a user gesture is required by the
 * browsers anyway).
 */

interface DesktopNotificationSpec {
  ticker: string;
  title: string;
  body: string;
  onClick: () => void;
}

interface DesktopNotificationOptions {
  /** Override the default `document.hidden` gate (e.g. for testing). */
  forceShowWhenVisible?: boolean;
}

export function showDesktopNotification(
  spec: DesktopNotificationSpec,
  opts: DesktopNotificationOptions = {},
): boolean {
  if (typeof window === 'undefined') return false;
  if (!('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;
  if (!(opts.forceShowWhenVisible === true) && document.hidden === false) {
    return false;
  }
  try {
    const n = new Notification(spec.title, {
      body: spec.body,
      tag: `araon-${spec.ticker}`,
    });
    n.onclick = () => {
      try {
        window.focus();
      } catch {
        // ignore — focus is best-effort
      }
      spec.onClick();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}
