# FocusLog

A minimal focus timer that logs what you do. Start a 15-minute session, get prompted for what you worked on when it ends, and build up a searchable activity log — all in the browser, no account required.

**Live:** [focuslog.app](https://focuslog.app)

---

## Features

- **Focus timer** — 15-minute default, pause, resume, and reset at any time
- **Activity log** — automatically records date, start time, end time, and description for every completed session
- **Auto-loop** — starts the next session immediately after you log what you did
- **CSV export** — download your full log as a spreadsheet-ready CSV
- **Google Sheets sync** — connect once, and every completed session is written straight to a sheet you control
- **Sound settings** — choose from 30+ start and end sounds via the settings panel
- **Offline-first** — the log persists in `localStorage`; no server, no account needed for core features
- **Browser tab countdown** — remaining time shows in the page title so you can see it from any tab

---

## Tech stack

| Layer | Choice |
|---|---|
| UI | React 18 + TypeScript |
| Styling | Tailwind CSS |
| Build | Vite |
| Tests | Vitest + React Testing Library + fast-check (property-based) |
| Auth | Google Identity Services (client-only, no backend) |
| Persistence | `localStorage` |
| Deployment | Vercel |

---

## Running locally

```bash
# 1. Clone
git clone https://github.com/tamaja4160/time-tracker.git
cd time-tracker

# 2. Install
npm install

# 3. Start dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

The timer and activity log work immediately with no configuration. Google Sheets requires a client ID (see below).

---

## Google Sheets setup

The Google Sheets feature uses a client-only OAuth flow — your data goes directly from the browser to your own Google account. No backend, no server ever sees your data.

### 1. Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a project
2. Enable the **Google Sheets API** and **Google Drive API**
3. Go to **APIs & Services → OAuth consent screen** and configure it
4. Go to **APIs & Services → Credentials → Create credentials → OAuth 2.0 Client ID**
5. Choose **Web application**
6. Add your dev URL to **Authorized JavaScript origins**:
   ```
   http://localhost:5173
   ```

### 2. Add your client ID

Create a `.env` file in the project root:

```env
VITE_GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
```

Restart the dev server — the "Write to Google Sheets" panel will now work.

### 3. Production

Add your production domain (e.g. `https://focuslog.app`) to the **Authorized JavaScript origins** in Google Cloud Console, and add `VITE_GOOGLE_CLIENT_ID` as an environment variable in your Vercel project settings.

---

## Project structure

```
src/
├── domain/          # Pure business logic — no DOM, no React
│   ├── timerEngine.ts       # State machine: start, pause, resume, tick, reset
│   ├── activityLog.ts       # Log entry construction and ordering
│   ├── csvExporter.ts       # CSV serialisation and round-trip parsing
│   ├── sheetsMapping.ts     # Log entry → spreadsheet row mapping
│   ├── validation.ts        # Duration and description validation
│   ├── timeFormat.ts        # MM:SS formatting
│   └── constants.ts         # Shared domain constants
│
├── infra/           # Side effects — browser APIs, network, storage
│   ├── googleAuth.ts        # GIS token flow (client-only OAuth)
│   ├── authClient.ts        # Auth metadata store adapter
│   ├── googleSheets.ts      # Sheets REST API client
│   ├── logStore.ts          # localStorage adapter for the activity log
│   ├── sound.ts             # Web Audio synthesis + sound player
│   ├── notifications.ts     # Browser Notifications API wrapper
│   ├── clock.ts             # Injectable clock (real + fake)
│   ├── storageLike.ts       # StorageLike interface
│   └── utils.ts             # Shared infra utilities
│
├── ui/              # React components and hooks
│   ├── App.tsx              # Root component — wires everything together
│   ├── TimerScreen.tsx      # Timer display + controls
│   ├── ActivityLogView.tsx  # Log table with export button
│   ├── ActivityPrompt.tsx   # Post-session description modal
│   ├── GoogleSheetsPanel.tsx# Connect, create/select sheet
│   ├── SettingsPanel.tsx    # Sound settings drawer
│   ├── CollapsibleSection.tsx
│   ├── ExportBar.tsx
│   ├── ErrorBanner.tsx
│   ├── TimerDisplay.tsx
│   ├── TimerControls.tsx
│   ├── useTimer.ts          # Timer state hook
│   └── timerReducer.ts      # Timer action reducer
│
├── types/           # Shared TypeScript interfaces
│   ├── timer.ts
│   ├── log.ts
│   ├── google.ts
│   ├── clock.ts
│   ├── result.ts
│   └── index.ts
│
└── test/            # Test utilities and shared fakes
    ├── setup.ts
    ├── fakeStorage.ts
    └── toolchain.test.ts
```

---

## Tests

```bash
# Run all tests once
npm test

# Watch mode
npm run test:watch
```

The test suite uses three layers:
- **Property-based tests** (`fast-check`) — the timer engine and domain logic are tested against arbitrarily generated inputs to prove invariants hold universally, not just for hand-picked examples
- **Unit tests** — infrastructure adapters (log store, Google auth)
- **Component tests** (React Testing Library) — full `App` render with fake timers and injected fakes

---

## Deployment

The app deploys automatically to Vercel on every push to `main`.

To deploy your own fork:

1. Push to GitHub
2. Import the repo at [vercel.com/new](https://vercel.com/new)
3. Add `VITE_GOOGLE_CLIENT_ID` under **Environment Variables**
4. Deploy — build command is `npm run build`, output directory is `dist`

---

## Privacy

FocusLog stores your activity log in your browser's `localStorage` only. Nothing is sent to any server. If you use Google Sheets, your data goes directly from your browser to your own Google account via Google's API — FocusLog never receives or stores it.
