/**
 * components/NetworkBanner.tsx
 *
 * An offline indicator for the web app.
 *
 * WHY THIS EXISTS
 * ---------------
 * The web client had no way to tell a student that the app had lost its connection, so a
 * request that failed simply looked like a broken feature. This says what is happening and
 * what it means for the data on screen.
 *
 * THE COPY SAYS THE CONSEQUENCE, NOT THE STATE
 * -------------------------------------------
 * "No internet connection" states a fact the student already knows - their wifi is off, or
 * they are in a lift. What they do not know is what it means for what they are looking at.
 * "Showing what was already loaded" tells them the data may be old, which is the thing that
 * actually changes how they should read the screen. That is the product rule: state the
 * consequence, not the condition.
 *
 * ⚠️ THE LIMITATION, WHICH IS REAL AND IS NOT FIXED HERE
 * -----------------------------------------------------
 * `navigator.onLine === false` is trustworthy - the operating system knows it has no
 * interface. `navigator.onLine === true` is only a HINT: a captive portal (hotel, campus,
 * airport wifi) reports online while every request fails.
 *
 * So this banner can be ABSENT WHEN IT SHOULD SHOW, never wrongly present. That asymmetry
 * is the safe direction - a false "you are offline" would send a student to debug their
 * connection when the problem is elsewhere - but it does mean the banner is not a guarantee.
 *
 * The gap is covered by the typed network error path instead: `api()` raises
 * `ApiError("Network error", 0, null)` for a thrown fetch, and `describeError` renders
 * status 0 as "Cannot reach the server". So a captive-portal failure still surfaces - just
 * as an error on the action the student took, rather than as a persistent banner.
 *
 * WHY NOT netinfo, WHICH THE MOBILE APP USES
 * -----------------------------------------
 * The mobile client wires `@react-native-community/netinfo` through React Query's
 * `onlineManager`. The web client has no such wiring, and adding it here would be a second,
 * differently-shaped mechanism for the same idea - and, as established when the mobile
 * work was done, netinfo's web shim subscribes to `navigator.connection` when it exists,
 * which is not the same signal as `window` online/offline. Using the browser's own events
 * directly is the honest implementation for a browser.
 */

import { useEffect, useState } from "react";

export function NetworkBanner() {
  // Initialised from the CURRENT state, not from `false`. Starting optimistic would leave
  // the banner absent for a student who opens the app while already offline - which is
  // exactly when it is most useful.
  const [offline, setOffline] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine === false,
  );

  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      // role="status" rather than "alert": this is a persistent condition, not an event.
      // An alert interrupts a screen reader mid-sentence; a status is announced politely
      // and does not steal focus. The distinction matters for anyone navigating by voice.
      role="status"
      aria-live="polite"
      className="border-b border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-4 py-2 text-center text-[11px] font-semibold text-[var(--color-warning)]"
    >
      You are offline — showing what was already loaded.
    </div>
  );
}

export default NetworkBanner;
