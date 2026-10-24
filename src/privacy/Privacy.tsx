import Navbar from '@/homepage/components/Navbar';

export default function Privacy() {
  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      <div className="max-w-4xl mx-auto px-4 py-20 pt-32">
        <header className="border-b-2 border-gray-200 pb-6 mb-8 flex items-center gap-5">
          <img src="/icons/icon128.png" alt="Calens Logo" className="w-16 h-16" />
          <div>
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Calens Privacy Policy</h1>
            <p className="text-gray-600"><strong>Last Updated:</strong> October 24, 2026</p>
          </div>
        </header>

        <nav className="border border-gray-200 rounded-lg p-5 mb-8">
          <h3 className="font-semibold text-lg mb-3">Table of Contents</h3>
          <ul className="space-y-1">
            <li><a href="#overview" className="text-brand underline hover:no-underline">Overview</a></li>
            <li><a href="#data-collection" className="text-brand underline hover:no-underline">Data Collection</a></li>
            <li><a href="#donations" className="text-brand underline hover:no-underline">Donations</a></li>
            <li><a href="#how-we-use" className="text-brand underline hover:no-underline">How We Use Your Data</a></li>
            <li><a href="#storage" className="text-brand underline hover:no-underline">Data Storage and Security</a></li>
            <li><a href="#sharing" className="text-brand underline hover:no-underline">Data Sharing and Third Parties</a></li>
            <li><a href="#your-rights" className="text-brand underline hover:no-underline">Your Data Rights</a></li>
            <li><a href="#permissions" className="text-brand underline hover:no-underline">Permissions Explained</a></li>
            <li><a href="#compliance" className="text-brand underline hover:no-underline">Compliance</a></li>
            <li><a href="#contact" className="text-brand underline hover:no-underline">Contact Us</a></li>
          </ul>
        </nav>

        <section id="overview" className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 border-b border-gray-200 pb-2 mb-4">Overview</h2>
          <p className="text-gray-700 leading-relaxed">
            Calens Chrome extension provides analytics and enhanced editing for Google Calendar. We are committed to protecting your privacy and being transparent about how we handle your data.
          </p>
        </section>

        <section id="data-collection" className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 border-b border-gray-200 pb-2 mb-4">Data Collection</h2>

          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">What Data We Collect</h3>
          <p className="text-gray-700 mb-4">Calens collects and processes the following data:</p>

          <h4 className="text-lg font-medium text-gray-800 mt-4 mb-2">Personal Identification Information</h4>
          <ul className="list-disc ml-6 text-gray-700 space-y-2">
            <li><strong>Email address:</strong> Obtained through Google OAuth to identify your account</li>
            <li><strong>Profile information:</strong> Your name and profile picture from your Google account</li>
          </ul>

          <h4 className="text-lg font-medium text-gray-800 mt-4 mb-2">Calendar Activity Data</h4>
          <ul className="list-disc ml-6 text-gray-700 space-y-2">
            <li><strong>Calendar events:</strong> Including event titles, start/end times, descriptions, locations, and attendees</li>
            <li><strong>Calendar metadata:</strong> Calendar names, colors, and settings</li>
            <li><strong>Tags and labels:</strong> Custom tags you create within the extension</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">Diagnostic Reports (only when you send one)</h3>
          <p className="text-gray-700 mb-3">
            If you click "Send report" in the Diagnostics section, Calens sends a report to our Firebase (Google Cloud) backend and to our private Discord channel so we can investigate the problem. Nothing is sent unless you choose to send it.
          </p>
          <ul className="list-disc ml-6 text-gray-700 space-y-2">
            <li><strong>Included:</strong> event and calendar IDs, extension version, browser and sync information, technical logs, and your email address so we can reply to you</li>
            <li><strong>Never included:</strong> event titles, descriptions, locations, or attendees</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">Anonymous Usage Count</h3>
          <p className="text-gray-700 mb-3">
            Once per day (UTC), when you open the Calens side panel, the extension sends a small count to our Supabase backend so we can see how many people use Calens each week. The count is not linked to your Google account.
          </p>
          <ul className="list-disc ml-6 text-gray-700 space-y-2">
            <li><strong>Included:</strong> a random install ID created the first time you open Calens and stored in your browser, and the Calens version number</li>
            <li><strong>Never included:</strong> your email address, name, Google account information, or any calendar data</li>
            <li><strong>Stored:</strong> in a private Supabase database (supabase.co), and each day's record is deleted after 35 days</li>
            <li><strong>IP address:</strong> like any web request, Supabase's request logs see your IP address. It is not stored with the count.</li>
            <li><strong>Opt-out:</strong> there is no setting to turn this off. Uninstalling Calens stops new counts from being sent.</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">How We Collect Data</h3>
          <p className="text-gray-700">
            All data is collected through official Google Calendar APIs using OAuth 2.0 authentication. You must explicitly grant permission for Calens to access your calendar data.
          </p>
        </section>

        <section id="donations" className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 border-b border-gray-200 pb-2 mb-4">Donations</h2>
          <p className="text-gray-700">
            Calens is free to use. Optional donations are handled by <a href="https://github.com/sponsors/dvquy13" target="_blank" rel="noopener noreferrer" className="text-brand underline hover:no-underline">GitHub Sponsors</a> on GitHub's site. Calens receives no payment data, and the extension does not collect or store any payment or billing information.
          </p>
        </section>

        <section id="how-we-use" className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 border-b border-gray-200 pb-2 mb-4">How We Use Your Data</h2>

          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">Primary Purposes</h3>
          <ul className="list-disc ml-6 text-gray-700 space-y-2">
            <li><strong>Authentication & Identity:</strong> To verify your Google account and maintain your session</li>
            <li><strong>Calendar Analytics:</strong> To calculate and display time statistics, contribution graphs, and insights about your schedule</li>
            <li><strong>Enhanced Editing:</strong> To provide improved event editing features and tag management</li>
            <li><strong>Synchronization:</strong> To keep your local data in sync with Google Calendar</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">Data Processing Location</h3>
          <ul className="list-disc ml-6 text-gray-700 space-y-2">
            <li><strong>100% Local Storage:</strong> All your calendar data is stored exclusively in your browser using IndexedDB</li>
            <li><strong>No Cloud Storage:</strong> We do not store your calendar data on any server or in cloud storage</li>
            <li><strong>No External Transmission:</strong> Your calendar data never leaves your device except when communicating directly with Google APIs</li>
          </ul>
        </section>

        <section id="storage" className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 border-b border-gray-200 pb-2 mb-4">Data Storage and Security</h2>

          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">Local Storage</h3>
          <ul className="list-disc ml-6 text-gray-700 space-y-2">
            <li>All calendar data, tags, and preferences are stored in your browser's IndexedDB</li>
            <li>Data persists only on your device and is not synchronized across devices by us</li>
            <li>You can clear all data by uninstalling the extension</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">Security Measures</h3>
          <ul className="list-disc ml-6 text-gray-700 space-y-2">
            <li><strong>OAuth 2.0:</strong> Industry-standard authentication via Chrome Identity API</li>
            <li><strong>HTTPS Only:</strong> All communications with Google APIs use encrypted HTTPS connections</li>
            <li><strong>Minimal Permissions:</strong> We request only the minimum necessary permissions</li>
            <li><strong>No Password Storage:</strong> We never see or store your Google password</li>
          </ul>
        </section>

        <section id="sharing" className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 border-b border-gray-200 pb-2 mb-4">Data Sharing and Third Parties</h2>

          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">We Do NOT:</h3>
          <ul className="list-disc ml-6 text-gray-700 space-y-2">
            <li>Sell your data to anyone</li>
            <li>Share your data with advertisers</li>
            <li>Use your data for marketing purposes</li>
            <li>Transfer your calendar data to third-party services</li>
            <li>Use third-party analytics, advertising or tracking services (no Google Analytics, Facebook Pixel, etc.). The only usage signal is the anonymous daily count described above.</li>
            <li>Collect data for purposes unrelated to calendar management</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">We Only Communicate With:</h3>
          <ul className="list-disc ml-6 text-gray-700 space-y-2">
            <li><strong>Google Calendar API</strong> (calendar.googleapis.com) - To fetch and update your calendar events</li>
            <li><strong>Google OAuth</strong> (accounts.google.com) - To authenticate your account</li>
            <li><strong>Google Calendar Web</strong> (calendar.google.com) - For content script enhancements</li>
            <li><strong>Firebase / Google Cloud</strong> (cloudfunctions.net) - Diagnostic reports, only when you send one</li>
            <li><strong>Discord</strong> - Diagnostic reports you choose to send are forwarded to our private Discord channel</li>
            <li><strong>Supabase</strong> (supabase.co) - Anonymous daily usage count</li>
          </ul>
        </section>

        <section id="your-rights" className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 border-b border-gray-200 pb-2 mb-4">Your Data Rights</h2>

          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">Access</h3>
          <p className="text-gray-700">You can view all your data through the extension's interface at any time.</p>

          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">Modification</h3>
          <p className="text-gray-700">You can edit or delete events and tags through the extension or directly in Google Calendar.</p>

          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">Deletion</h3>
          <ul className="list-disc ml-6 text-gray-700 space-y-2">
            <li><strong>Uninstall the extension:</strong> Removes all local data from your browser</li>
            <li><strong>Revoke access:</strong> Go to <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="text-brand underline hover:no-underline">Google Account Permissions</a> and remove Calens</li>
            <li><strong>Clear browser data:</strong> Use Chrome's "Clear browsing data" feature</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">Export</h3>
          <p className="text-gray-700">Your data remains in Google Calendar and can be exported using Google Takeout.</p>
        </section>

        <section id="permissions" className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 border-b border-gray-200 pb-2 mb-4">Permissions Explained</h2>

          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">Chrome Permissions</h3>
          <ul className="list-disc ml-6 text-gray-700 space-y-2">
            <li><code className="bg-gray-100 px-2 py-0.5 rounded text-sm">storage</code> - Store user preferences and settings locally</li>
            <li><code className="bg-gray-100 px-2 py-0.5 rounded text-sm">identity</code> - Authenticate with Google using OAuth 2.0</li>
            <li><code className="bg-gray-100 px-2 py-0.5 rounded text-sm">sidePanel</code> - Display the extension's user interface</li>
            <li><code className="bg-gray-100 px-2 py-0.5 rounded text-sm">alarms</code> - Schedule background synchronization tasks</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">Google API Scopes</h3>
          <ul className="list-disc ml-6 text-gray-700 space-y-2">
            <li><code className="bg-gray-100 px-2 py-0.5 rounded text-sm">calendar.readonly</code> - Read your calendar events and metadata</li>
            <li><code className="bg-gray-100 px-2 py-0.5 rounded text-sm">calendar.events</code> - Update events when you make edits through the extension</li>
            <li><code className="bg-gray-100 px-2 py-0.5 rounded text-sm">userinfo.email</code> - Get your email address for account identification</li>
            <li><code className="bg-gray-100 px-2 py-0.5 rounded text-sm">userinfo.profile</code> - Get your name and profile picture</li>
          </ul>
        </section>

        <section id="compliance" className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 border-b border-gray-200 pb-2 mb-4">Children's Privacy</h2>
          <p className="text-gray-700">
            Calens is not directed at children under 13 years of age. We do not knowingly collect personal information from children. If you are a parent or guardian and believe your child has provided us with data, please contact us.
          </p>

          <h2 className="text-2xl font-bold text-gray-900 border-b border-gray-200 pb-2 mb-4 mt-10">Data Retention</h2>
          <ul className="list-disc ml-6 text-gray-700 space-y-2">
            <li><strong>Active Use:</strong> Data is retained locally as long as you have the extension installed</li>
            <li><strong>After Uninstall:</strong> All local data is automatically deleted when you uninstall the extension</li>
            <li><strong>Usage Count:</strong> Daily usage records are deleted after 35 days</li>
            <li><strong>Google Calendar:</strong> Your calendar data remains in your Google account according to Google's policies</li>
          </ul>

          <h2 className="text-2xl font-bold text-gray-900 border-b border-gray-200 pb-2 mb-4 mt-10">Compliance</h2>
          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">We Comply With:</h3>
          <ul className="list-disc ml-6 text-gray-700 space-y-2">
            <li>Chrome Web Store Developer Program Policies</li>
            <li>Google API Services User Data Policy</li>
            <li>General Data Protection Regulation (GDPR)</li>
            <li>California Consumer Privacy Act (CCPA)</li>
          </ul>

          <h3 className="text-xl font-semibold text-gray-800 mt-6 mb-3">Limited Use Disclosure</h3>
          <p className="text-gray-700">
            Calens' use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="text-brand underline hover:no-underline">Google API Services User Data Policy</a>, including the Limited Use requirements.
          </p>
        </section>

        <section id="changes" className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 border-b border-gray-200 pb-2 mb-4">Changes to This Policy</h2>
          <p className="text-gray-700 mb-4">We may update this privacy policy from time to time. Significant changes will be communicated through:</p>
          <ul className="list-disc ml-6 text-gray-700 space-y-2">
            <li>Updates to this page with a new "Last Updated" date</li>
            <li>Chrome Web Store extension listing updates</li>
            <li>In-extension notifications for major changes</li>
          </ul>
        </section>

        <section id="contact" className="mb-10">
          <h2 className="text-2xl font-bold text-gray-900 border-b border-gray-200 pb-2 mb-4">Contact Us</h2>
          <p className="text-gray-700">
            If you have questions, concerns, or requests regarding this privacy policy or your data, please contact us through the Chrome Web Store support page.
          </p>
        </section>

        <footer className="border-t-2 border-gray-200 pt-6 mt-12 text-center">
          <p className="text-gray-600 italic">
            This privacy policy is effective as of the date stated above and applies to all users of the Calens Chrome extension.
          </p>
          <p className="text-gray-500 mt-4">&copy; 2026 Calens</p>
        </footer>
      </div>
    </div>
  );
}
