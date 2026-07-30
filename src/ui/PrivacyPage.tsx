export function PrivacyPage() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-black/5 px-6 py-5">
        <div className="mx-auto max-w-2xl flex items-center justify-between">
          <a
            href="#/"
            className="text-xl font-bold tracking-tight"
            style={{ fontFamily: "'Google Sans', 'Product Sans', sans-serif" }}
          >
            focus log
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="mb-8 text-sm text-ink-muted">Last updated: July 2026</p>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Overview</h2>
          <p className="text-ink-soft leading-relaxed">
            focus log is a productivity timer that helps you track focused work sessions.
            We take your privacy seriously. This policy explains what data the app
            handles and how.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Data we do not collect</h2>
          <p className="mb-3 text-ink-soft leading-relaxed">
            focus log does not operate any servers or databases. We do not collect,
            store, or transmit any personal information to our systems. Specifically:
          </p>
          <ul className="list-disc list-inside space-y-1.5 text-ink-soft">
            <li>No account registration or login with focus log</li>
            <li>No analytics or tracking scripts</li>
            <li>No advertising or third-party data sharing</li>
            <li>No cookies beyond what your browser requires</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Data stored on your device</h2>
          <p className="text-ink-soft leading-relaxed">
            Your activity log (session dates, times, and notes) is stored exclusively
            in your browser's <code className="rounded bg-ink/8 px-1 font-mono text-sm">localStorage</code>.
            This data never leaves your device unless you choose to export it or
            connect Google Sheets.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Google Sheets integration</h2>
          <p className="mb-3 text-ink-soft leading-relaxed">
            If you choose to connect Google Sheets, focus log uses Google's OAuth 2.0
            to request permission to write to your Google Sheets. This means:
          </p>
          <ul className="list-disc list-inside space-y-1.5 text-ink-soft">
            <li>
              The app requests the <code className="rounded bg-ink/8 px-1 font-mono text-sm">spreadsheets</code> scope,
              which allows it to read and write Google Sheets files.
            </li>
            <li>
              Session data is written directly from your browser to your own Google
              account — it does not pass through our servers.
            </li>
            <li>
              We only write to the sheet you explicitly select or create. We do not
              read or modify any other files.
            </li>
            <li>
              Your Google access token is stored temporarily in your browser's
              localStorage and is never sent to any focus log server.
            </li>
          </ul>
          <p className="mt-3 text-ink-soft leading-relaxed">
            focus log's use of information received from Google APIs adheres to the{' '}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-ink"
            >
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Third-party services</h2>
          <p className="text-ink-soft leading-relaxed">
            focus log is hosted on Vercel. When you visit the app, Vercel may log
            standard web server data (IP address, browser type, pages visited) as part
            of their infrastructure. See{' '}
            <a
              href="https://vercel.com/legal/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-ink"
            >
              Vercel's Privacy Policy
            </a>{' '}
            for details.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Children's privacy</h2>
          <p className="text-ink-soft leading-relaxed">
            focus log is not directed at children under 13. We do not knowingly
            collect any information from children.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Changes to this policy</h2>
          <p className="text-ink-soft leading-relaxed">
            We may update this policy from time to time. The date at the top of this
            page reflects the most recent revision. Continued use of the app after
            changes constitutes acceptance of the updated policy.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Contact</h2>
          <p className="text-ink-soft leading-relaxed">
            If you have any questions about this privacy policy, please contact us at{' '}
            <a href="mailto:privacy@focuslog.app" className="underline hover:text-ink">
              privacy@focuslog.app
            </a>
            .
          </p>
        </section>
      </main>

      <footer className="border-t border-black/5 px-6 py-6 text-center text-sm text-ink-muted">
        <a href="#/" className="hover:text-ink">← Back to focus log</a>
        <span className="mx-3">·</span>
        <a href="#/terms" className="hover:text-ink">Terms of Service</a>
      </footer>
    </div>
  );
}
