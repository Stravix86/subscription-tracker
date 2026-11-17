# Subscription Tracker

**Stop paying for things you forgot about.**

Free trials quietly turn into paid plans. Yearly renewals show up out of nowhere. Small monthly charges add up to a lot, and many of them are for services nobody uses any more. Subscription Tracker lists everything you pay for in one place, shows what it really costs per month and per year, and reminds you before anything renews so you have time to cancel.

**Live app: https://stravix86.github.io/subscription-tracker/**

![Subscription Tracker dashboard](docs/screenshot.jpg)

## Download

| Platform | Download | Notes |
|----------|----------|-------|
| Web (any device) | [Open the app](https://stravix86.github.io/subscription-tracker/) | Use your browser's **Install app** / **Add to Home screen** to get an app icon. |
| Windows 10/11 | [SubscriptionTracker-windows.exe](https://github.com/Stravix86/subscription-tracker/releases/latest/download/SubscriptionTracker-windows.exe) | Portable, about 3 MB, nothing to install. Windows may say "Windows protected your PC" because the exe isn't code-signed: click **More info → Run anyway**. |
| Android 7+ | [SubscriptionTracker-android.apk](https://github.com/Stravix86/subscription-tracker/releases/latest/download/SubscriptionTracker-android.apk) | Allow your browser to "install unknown apps" when asked. Calendar reminders work; browser notifications don't exist inside the app. |

Each app keeps its own data. To move your list between them, use **Export JSON** in one and **Import JSON** in the other.

## Features

- **Track every subscription:** name, price, currency, billing cycle (weekly, monthly, yearly, or every N days), next renewal date, category, and an optional free-trial end date.
- **See the real cost:** monthly and yearly totals, plus what's due in the next 30 days. Several currencies are totalled separately rather than converted.
- **Upcoming renewals first:** the list is sorted by date, and anything renewing (or any trial ending) within 7 days is highlighted.
- **"Not using" flag:** mark a subscription you don't use and see how much you'd save per year by cancelling it.
- **Reminders without a server:**
  - Download an `.ics` calendar file for one subscription or all of them. Each renewal is a repeating event with an alert at 9:00, 1–14 days before (you choose). Trial end dates get their own event.
  - Browser notifications while the app is open.
- **Dates keep themselves up to date:** once a renewal date passes, it rolls forward to the next one. Month-end dates stay correct, so a plan billed on the 31st renews on the 30th in 30-day months and the 31st again after that.
- **Private:** everything is stored in your browser (`localStorage`). There are no accounts, no analytics and no network requests.
- **Backup:** export to JSON and import it again on any device. Importing merges with what's already there.
- **Installable and offline:** a PWA with a service worker, so you can add it to your home screen and use it without a connection.
- **Light and dark themes** (follows your system, or pick one), and a layout that works down to phone width.
- **Tiny:** plain HTML, CSS and JavaScript. No framework, no dependencies, no build step.

## Run it locally

Clone the repo and serve the folder with any static file server:

```bash
git clone https://github.com/Stravix86/subscription-tracker.git
```

```bash
cd subscription-tracker
```

```bash
python -m http.server 8000
```

Then open http://localhost:8000. (`npx serve` works too.) Opening `index.html` directly from disk also works, but the service worker (offline mode) only runs over `http://localhost` or `https://`.

## How costs are calculated

| Cycle        | Yearly cost        |
|--------------|--------------------|
| Weekly       | price × 52         |
| Monthly      | price × 12         |
| Yearly       | price              |
| Every N days | price × 365 ÷ N    |

The monthly total is the yearly total divided by 12. "Due next 30 days" adds up every charge that falls within the next 30 days, so a weekly plan can count 4 or 5 times.

## Project layout

```
index.html            markup
style.css             styles, light and dark themes
app.js                all app logic
sw.js                 service worker (offline cache)
manifest.webmanifest  PWA manifest
icons/                app icons
native/desktop/       Windows wrapper (Tauri, uses the built-in WebView2)
native/android/       Android wrapper (a small WebView app)
.github/workflows/    builds the exe and apk
```

When you change any file, bump `CACHE` in `sw.js` (for example `subtrack-v3`) so installed copies pick up the new version.

## Building the Windows and Android apps

The web files stay the single source of truth; the native apps just bundle them. Push a version tag and GitHub Actions builds both and attaches them to a Release:

```bash
git tag v1.0.1
```

```bash
git push origin v1.0.1
```

The apk is signed with a key stored in the repo secrets `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD`, so new versions install over old ones without losing data.

To build the exe yourself you need Rust and Node: run `node native/stage-web.mjs`, then `npx @tauri-apps/cli@2 build --no-bundle` inside `native/desktop`.

## License

MIT
