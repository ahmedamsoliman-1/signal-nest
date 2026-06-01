# SignalNest

SignalNest is a small Next.js platform for monitoring slow status portals without manually refreshing them all day.

This repo starts with one real provider:

- `CGSudan Passports`: checks `https://cgsudan-dubai.ae/passports/` for a national ID and records whether the passport has reached the consulate.

## Why this shape

Instead of building a one-off script, this version introduces:

- a branded dashboard
- reusable provider adapters
- persisted monitor jobs in Firestore or `.data/jobs.json`
- a shared runner for UI actions and background cron-style execution
- browser push notifications through Firebase Cloud Messaging

## Setup

```bash
npm install
```

## Run locally

```bash
npm run dev
```

Open `http://localhost:3000`.

## Background checks

Run any due jobs once:

```bash
npm run jobs:due
```

That command is the one to schedule every 5 minutes.

## Firestore

SignalNest now prefers Firestore when these environment variables are present:

```bash
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

If those values are not configured, the app falls back to local JSON files inside `.data/`.

## Web push

For deployed browser notifications, add the Firebase web app config plus a VAPID public key:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_VAPID_KEY=...
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

The browser must visit the app once and allow notifications. SignalNest then stores the push token and sends FCM alerts when a monitor changes.

## Scheduled checks with GitHub Actions

Vercel Hobby does not allow every-5-minute cron schedules, so this repo uses GitHub Actions instead.

Add this environment variable on Vercel:

```bash
CRON_SECRET=some-random-secret
```

Then add these GitHub repository secrets:

```bash
SIGNALNEST_CRON_URL=https://your-app.vercel.app/api/cron
CRON_SECRET=the-same-secret-you-set-on-vercel
```

The workflow file is [signalnest-cron.yml](/Users/ahmedsoliman/Desktop/Repos/Playground/pass-finder/.github/workflows/signalnest-cron.yml), and it triggers the deployed cron endpoint every 5 minutes.

## Notification test mode

By default, SignalNest only sends notifications when a monitor changes state or becomes available.

If you want to verify the full pipeline every 5 minutes, set:

```bash
SIGNALNEST_NOTIFY_MODE=always
```

This makes every scheduled run notify, even if the result did not change.

When testing is done, set it back to:

```bash
SIGNALNEST_NOTIFY_MODE=changes
```

If you also want scheduled cron runs to execute every enabled job even when it is not due yet, set:

```bash
SIGNALNEST_CRON_FORCE_RUN=true
```

This is useful only for testing. In normal use, keep it `false` so jobs respect their configured intervals.
