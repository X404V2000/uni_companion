# Building the APK — founder runbook

**Status:** everything is ready. This is blocked only on a free Expo account.

- App id: `za.co.varsitycompanion`
- Version: `1.0.0`, build `versionCode 1`
- Artefact: **APK** (not an AAB — see `DEC-0006`), for the FNB prototype submission
- Backend the app talks to: `https://uni-companion.onrender.com`

Verified before this was written: `expo config` resolves, `tsc --noEmit` clean,
`expo export --platform android` produces a 3MB Hermes bundle, and the backend
`/health` returns 200.

---

## Why this needs you, and why it is free

The build runs in Expo's cloud (EAS). That needs an Expo account. An account
needs an email address — **any email you already own works**. Gmail, Outlook,
whatever you use. There is no charge and nothing to send.

There is no local alternative: this machine has no Java, no Android SDK and no
Gradle, so a local APK build would mean a multi-gigabyte install first.

**iOS is out of scope** — it needs an Apple Developer account (~R1,300/yr) or a
Mac. Android-only was confirmed as acceptable on 2026-10-21.

---

## Five steps

### 1. Create the account (2 minutes, free)

Open <https://expo.dev/signup> in a browser and sign up with an email you already
have. Note the username.

### 2. Log in on this machine

```bash
cd mobile
npx eas-cli login
```

It asks for the email/username and password you just set. To avoid retyping the
password every time, create a token at
<https://expo.dev/settings/access-tokens> and use it instead.

### 3. Link the project to the account

```bash
cd mobile
npx eas-cli init
```

When it asks **"Would you like to create a new project?"**, say **yes**. It writes
the project id into `app.json`.

### 4. Build the APK

```bash
cd mobile
npx eas-cli build --platform android --profile apk
```

Use `--profile apk`. The `production` profile builds an **AAB**, which cannot be
installed on a phone directly — that profile is for the Play Store, not for FNB.

The build takes roughly 10–20 minutes. EAS prints a link to the build page; it
also installs the APK automatically once finished.

### 5. Get the file

Either let EAS install it, or download it from the build page in the browser.
To install by hand:

```bash
adb install -r /path/to/varsity-companion.apk
```

Or copy the APK to the phone and open it (Android will warn about installing
from unknown sources — expected for a non-Play-Store build).

---

## Then verify it actually works

An installed app is not a working app. After installing:

1. It opens to the login screen (not a crash).
2. Sign up with a real account.
3. The dashboard loads — this proves it reached the backend.
4. Add a module. **Known bug:** the dashboard count may not update until
   refresh (TASK-0005). Note it; do not be surprised by it.
5. Open Settings from the header gear — the screen added on 2026-10-21.

The first request after the backend has been idle takes **5–15 seconds** (Render
free tier cold start). That is not a bug; it is the free tier, and the reason the
app has to degrade gracefully. Let the first screen finish loading before
concluding anything is broken.

---

## If the build fails

Read the **first** error in the EAS log, not the last — later lines are usually
consequences.

The common causes, in order:

| Symptom | Cause |
| --- | --- |
| `Invalid UUID appId` | step 3 was skipped — run `eas init` |
| Gradle version errors | an npm dependency drifted; run `npx expo-doctor` |
| `package.json` not found | wrong directory; must be `mobile/` |

---

## What was changed to make this buildable (2026-10-21)

- `app.json`: added `android.package = "za.co.varsitycompanion"` and
  `versionCode: 1`. The package id is **permanent** once published.
- `eas.json`: added, with an `apk` profile (`buildType: apk`, internal
  distribution) and a `production` AAB profile.
- Removed `@react-native-async-storage/async-storage`: declared but imported
  nowhere (tokens use `expo-secure-store`). It was at v3.1.1 where Expo expects
  2.2.0 — an unused native module at the wrong major version is a build risk.
- Aligned `react-native-screens` and `react-native-safe-area-context` to the
  versions Expo SDK 57 expects.
