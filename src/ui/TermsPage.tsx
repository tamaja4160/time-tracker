export function TermsPage() {
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
        <h1 className="mb-2 text-3xl font-bold tracking-tight">Terms of Service</h1>
        <p className="mb-8 text-sm text-ink-muted">Last updated: July 2026</p>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Acceptance</h2>
          <p className="text-ink-soft leading-relaxed">
            By using focus log at{' '}
            <a href="https://focuslog.app" className="underline hover:text-ink">
              focuslog.app
            </a>
            , you agree to these terms. If you do not agree, please do not use the app.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">What focus log is</h2>
          <p className="text-ink-soft leading-relaxed">
            focus log is a free, browser-based productivity timer. It helps you run
            timed focus sessions and log what you accomplished. All session data is
            stored locally in your browser. The optional Google Sheets integration
            writes data directly to your own Google account.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Use of the app</h2>
          <p className="mb-3 text-ink-soft leading-relaxed">You agree to use focus log only for lawful purposes. You must not:</p>
          <ul className="list-disc list-inside space-y-1.5 text-ink-soft">
            <li>Attempt to reverse-engineer, modify, or distribute the app without permission</li>
            <li>Use the app to violate any applicable law or regulation</li>
            <li>Interfere with the security or availability of the app</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Google Sheets integration</h2>
          <p className="text-ink-soft leading-relaxed">
            When you connect Google Sheets, you grant focus log permission to write
            session data to spreadsheets in your Google account. You can revoke this
            access at any time via your{' '}
            <a
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-ink"
            >
              Google account permissions
            </a>
            . focus log is not responsible for the content or security of your Google
            account or spreadsheets.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Disclaimer of warranties</h2>
          <p className="text-ink-soft leading-relaxed">
            focus log is provided "as is" without warranties of any kind. We do not
            guarantee that the app will be available, error-free, or suitable for any
            particular purpose. Use it at your own risk.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Limitation of liability</h2>
          <p className="text-ink-soft leading-relaxed">
            To the fullest extent permitted by law, focus log and its creators shall
            not be liable for any indirect, incidental, or consequential damages
            arising from your use of the app, including any loss of data.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Changes to these terms</h2>
          <p className="text-ink-soft leading-relaxed">
            We may update these terms at any time. The date at the top of this page
            reflects the most recent revision. Continued use of the app constitutes
            acceptance of the updated terms.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Contact</h2>
          <p className="text-ink-soft leading-relaxed">
            Questions about these terms?{' '}
            <a href="mailto:hello@focuslog.app" className="underline hover:text-ink">
              hello@focuslog.app
            </a>
          </p>
        </section>
      </main>

      <footer className="border-t border-black/5 px-6 py-6 text-center text-sm text-ink-muted">
        <a href="#/" className="hover:text-ink">← Back to focus log</a>
        <span className="mx-3">·</span>
        <a href="#/privacy" className="hover:text-ink">Privacy Policy</a>
      </footer>
    </div>
  );
}
