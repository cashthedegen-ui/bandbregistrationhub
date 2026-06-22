import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/trust")({
  head: () => ({
    meta: [
      { title: "Trust & Security — B & B Transit" },
      {
        name: "description",
        content:
          "How B & B Transit protects student registration data, manages access, and handles privacy requests.",
      },
      { property: "og:title", content: "Trust & Security — B & B Transit" },
      {
        property: "og:description",
        content:
          "How B & B Transit protects student registration data, manages access, and handles privacy requests.",
      },
    ],
  }),
  component: TrustPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border py-8">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function TrustPage() {
  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
        <header className="mt-6">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">
            Trust &amp; Security
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            This page is maintained by B &amp; B Transit to answer common security and privacy
            questions about the Student Registration Hub. It describes current app-visible
            controls and operating practices. It is not an independent certification or audit
            statement.
          </p>
        </header>

        <Section title="Who uses this app">
          <p>
            The Student Registration Hub is an internal operations portal used by B &amp; B Transit
            staff to manage student bus registrations sourced from school enrollment forms. It is
            not a public-facing product; parents and students do not log in here.
          </p>
        </Section>

        <Section title="Access &amp; authentication">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Sign-in is required for every page that shows student data.</li>
            <li>
              Accounts are provisioned for staff only. Anonymous sign-ups are disabled.
            </li>
            <li>
              Roles are stored server-side and enforced by database row-level security; the client
              cannot grant itself additional access.
            </li>
            <li>Sessions are managed by our authentication provider and can be revoked at any time.</li>
          </ul>
        </Section>

        <Section title="Hosting &amp; platform">
          <p>
            The app is built on Lovable Cloud, which provides managed hosting, an authenticated
            database, and serverless functions. Data is stored in a Postgres database with
            row-level security enabled on tables that contain student information. Backups and
            platform patching are handled by the underlying platform provider.
          </p>
          <p className="text-xs">
            Mention of platform capabilities is descriptive only and is not a Lovable-issued
            certification.
          </p>
        </Section>

        <Section title="Data we handle">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Student registration details synced from school enrollment forms (Formstack).</li>
            <li>Pickup and drop-off addresses used to plan routes.</li>
            <li>Parent / guardian contact details used for confirmations and operational notices.</li>
            <li>Payment status (self-pay vs. financial aid) — no card numbers are stored in this app.</li>
          </ul>
        </Section>

        <Section title="Subprocessors &amp; integrations">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Lovable Cloud — application hosting, database, authentication.</li>
            <li>Formstack — source system for school enrollment forms.</li>
          </ul>
        </Section>

        <Section title="Retention &amp; archives">
          <p>
            Active registration records are kept for the current school year. Prior seasons can be
            archived inside the app for historical reference. Records are removed on request from
            the school or guardian, subject to any retention obligations B &amp; B Transit has under
            its agreements with schools.
          </p>
        </Section>

        <Section title="Privacy requests &amp; security contact">
          <p>
            For privacy requests (access, correction, deletion) or to report a suspected security
            issue, contact us at:
          </p>
          <p className="text-foreground">
            B &amp; B Transportation
            <br />
            203-393-9750 — David@BandBTrans.com
          </p>
        </Section>

        <p className="mt-10 text-xs text-muted-foreground">
          This page is editable content owned by B &amp; B Transit and may be updated as practices
          evolve.
        </p>
      </div>
    </div>
  );
}
