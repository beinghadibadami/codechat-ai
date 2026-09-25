/**
 * useUnloadWarning — prompt the browser's native "leave site?" dialog while
 * some work is in progress that would be lost on navigation/refresh/close.
 *
 * Only guards full-page unloads (refresh, back to a non-SPA page, tab close).
 * In-app route changes are handled separately where needed.
 */
import { useEffect } from 'react';

export const useUnloadWarning = (active: boolean): void => {
  useEffect(() => {
    if (!active) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Required for the prompt to show in some browsers.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [active]);
};
