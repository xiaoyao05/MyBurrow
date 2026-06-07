import TopNav from "../components/TopNav";
import "../styles/Legal.css";

export default function PrivacyPolicy() {
  return (
    <div className="legal-shell">
      <TopNav showSearch={false} />

      <main className="legal-page">
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: June 4, 2026</p>

        <section>
          <h2>Overview</h2>
          <p>
            MyBurrow helps users list, borrow, reserve, and review shared items.
            This policy explains what information MyBurrow collects and how it is
            used to provide the service.
          </p>
        </section>

        <section>
          <h2>Information We Collect</h2>
          <p>
            We may collect account details such as your name, email address,
            contact number, profile information, listings, listing images, chat
            messages, reservations, reviews, and saved listings.
          </p>
        </section>

        <section>
          <h2>Google Account Data</h2>
          <p>
            If you choose to connect Google, MyBurrow may use your Google account
            to sign you in and may request Google Calendar access so reservation
            dates can be added to your calendar. Calendar access is used only for
            reservation-related calendar events.
          </p>
        </section>

        <section>
          <h2>How We Use Information</h2>
          <p>
            We use your information to create and manage your account, show
            listings, support chats and reservations, add calendar events when
            requested, improve app functionality, and protect the service from
            misuse.
          </p>
        </section>

        <section>
          <h2>Sharing</h2>
          <p>
            Information that is part of your public profile, listings, chats,
            reservations, or reviews may be visible to relevant MyBurrow users.
            We do not sell personal information.
          </p>
        </section>

        <section>
          <h2>Data Control</h2>
          <p>
            You can update your profile in the app. You can also revoke Google
            access from your Google Account permissions page at any time.
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            For privacy questions, contact the MyBurrow developer using the
            support email shown on the Google consent screen.
          </p>
        </section>
      </main>
    </div>
  );
}
