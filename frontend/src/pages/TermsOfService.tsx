import TopNav from "../components/TopNav";
import "../styles/Legal.css";

export default function TermsOfService() {
  return (
    <div className="legal-shell">
      <TopNav showSearch={false} />

      <main className="legal-page">
        <h1>Terms of Service</h1>
        <p className="legal-updated">Last updated: June 4, 2026</p>

        <section>
          <h2>Using MyBurrow</h2>
          <p>
            MyBurrow is an item-sharing app that lets users list items, chat,
            request reservations, and review borrowing experiences. By using
            MyBurrow, you agree to use the app responsibly and lawfully.
          </p>
        </section>

        <section>
          <h2>Accounts</h2>
          <p>
            You are responsible for the information you provide and for activity
            on your account. Keep your login details secure and provide accurate
            profile and contact information.
          </p>
        </section>

        <section>
          <h2>Listings and Borrowing</h2>
          <p>
            Users who list items are responsible for describing them accurately.
            Borrowers are responsible for using borrowed items carefully,
            returning them as agreed, and communicating clearly with owners.
          </p>
        </section>

        <section>
          <h2>Google Calendar</h2>
          <p>
            If you connect Google Calendar, MyBurrow may create reservation
            events for you when requested. You can revoke Google access through
            your Google Account permissions at any time.
          </p>
        </section>

        <section>
          <h2>Content</h2>
          <p>
            Do not post illegal, harmful, misleading, abusive, or infringing
            content. MyBurrow may remove content or restrict access if misuse is
            detected.
          </p>
        </section>

        <section>
          <h2>Availability</h2>
          <p>
            MyBurrow is provided as-is. We try to keep the app useful and
            reliable, but we do not guarantee uninterrupted service or that every
            listing or reservation will be available.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            For questions about these terms, contact the MyBurrow developer using
            the support email shown on the Google consent screen.
          </p>
        </section>
      </main>
    </div>
  );
}
