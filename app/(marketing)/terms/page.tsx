import { Scale } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Terms of Service — Luman",
  description: "The terms that govern your use of Luman.",
};

const UPDATED = "August 22, 2026";

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 space-y-16 pb-24">
      <div className="space-y-4 max-w-3xl">
        <div className="inline-block px-3 py-1 border border-black bg-accent text-accent-foreground text-xs font-black uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          <Scale className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
          Legal
        </div>
        <h1 className="text-4xl sm:text-6xl font-black uppercase text-foreground leading-none">Terms of Service</h1>
        <p className="text-xs font-bold uppercase text-muted-foreground">Last updated {UPDATED}</p>
      </div>

      <hr className="border-2 border-black" />

      <div className="space-y-12 text-sm leading-relaxed text-foreground">
        <section className="space-y-3">
          <p>
            These Terms of Service ("Terms") govern your access to and use of Luman, a workspace product built by Lucide
            Tech ("Lucide Tech," "we," "us"), including luman.lucide.in and the Luman desktop app (together, the
            "Service"). By creating an account or otherwise using the Service, you agree to these Terms. If you are
            using the Service on behalf of an organization, you are agreeing on that organization's behalf and
            confirming you have the authority to do so.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-black uppercase border-b-2 border-black w-max pb-1">1. Your account</h2>
          <p>
            You must provide accurate information when creating an account and keep your login credentials secure. You
            are responsible for all activity that occurs under your account. You must be at least 13 years old to use
            Luman.
          </p>
          <p>
            You can sign in with a Google account. Doing so only shares your basic Google profile (name, email, profile
            photo) with us — it does not give Luman access to your Gmail, Drive, or other Google services.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-black uppercase border-b-2 border-black w-max pb-1">
            2. Organizations and workspaces
          </h2>
          <p>
            Luman lets you create or join an organization and its workspaces. Content shared inside a workspace — notes,
            tasks, calendar events, chat messages, whiteboards, and files — is visible to other members of that
            workspace according to the roles and permissions your organization sets. If you join an organization someone
            else administers, that administrator can manage membership and workspace-level permissions.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-black uppercase border-b-2 border-black w-max pb-1">3. Your content</h2>
          <p>
            You retain ownership of the notes, documents, tasks, messages, and files you create in Luman ("Your
            Content"). By using the Service, you grant Lucide Tech a limited license to host, store, transmit, and
            display Your Content solely to operate and provide the Service to you and the teammates you share it with.
            We do not claim ownership of Your Content and do not use it to train AI models.
          </p>
          <p>
            You are responsible for Your Content and must have the rights to share anything you upload or create in
            Luman. Do not upload content that is unlawful, infringes someone else's rights, or that you do not have
            permission to share with your organization's other members.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-black uppercase border-b-2 border-black w-max pb-1">
            4. The voice agent and AI features
          </h2>
          <p>
            Luman includes an optional voice agent and AI assistant that can interpret spoken or typed commands, open or
            create content on your behalf, and generate spoken replies. These features send the relevant text or audio
            to third-party AI providers to process your request (see our{" "}
            <Link href="/privacy" className="underline font-bold hover:text-accent">
              Privacy Policy
            </Link>{" "}
            for which providers and what they receive). AI-generated actions and replies can be wrong; review anything
            the assistant does or says before relying on it, especially destructive actions like deleting content.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-black uppercase border-b-2 border-black w-max pb-1">5. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul className="list-disc pl-5 space-y-2">
            <li>Use the Service for any unlawful purpose or in violation of any applicable law.</li>
            <li>Attempt to gain unauthorized access to another user's account, organization, or content.</li>
            <li>Interfere with or disrupt the Service, including through excessive automated requests.</li>
            <li>Reverse engineer or attempt to extract the source code of the Service, except as permitted by law.</li>
            <li>Use the Service to transmit malware, spam, or content that harasses or harms others.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-black uppercase border-b-2 border-black w-max pb-1">
            6. Subscriptions and billing
          </h2>
          <p>
            Some Luman features may require a paid subscription. Where a plan is paid, pricing and billing terms are
            shown to you at the time of purchase. You can cancel a subscription at any time; cancellation takes effect
            at the end of the current billing period unless stated otherwise.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-black uppercase border-b-2 border-black w-max pb-1">7. Termination</h2>
          <p>
            You can stop using the Service and delete your account at any time. We may suspend or terminate your access
            if you violate these Terms, or if we discontinue the Service, with notice where reasonably possible. Upon
            termination, your right to use the Service ends, though certain provisions of these Terms (including
            ownership, disclaimers, and limitation of liability) survive.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-black uppercase border-b-2 border-black w-max pb-1">8. Disclaimers</h2>
          <p>
            The Service is provided "as is" and "as available," without warranties of any kind, express or implied,
            including warranties of merchantability, fitness for a particular purpose, or non-infringement. We do not
            warrant that the Service will be uninterrupted, error-free, or that any AI output will be accurate.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-black uppercase border-b-2 border-black w-max pb-1">
            9. Limitation of liability
          </h2>
          <p>
            To the maximum extent permitted by law, Lucide Tech will not be liable for any indirect, incidental,
            special, consequential, or punitive damages, or any loss of data, profits, or revenue, arising from your use
            of the Service, even if advised of the possibility of such damages.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-black uppercase border-b-2 border-black w-max pb-1">
            10. Changes to these Terms
          </h2>
          <p>
            We may update these Terms as Luman changes. If we make material changes, we will update the "Last updated"
            date above and, where appropriate, notify you directly. Continued use of the Service after changes take
            effect constitutes acceptance of the updated Terms.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-black uppercase border-b-2 border-black w-max pb-1">11. Contact</h2>
          <p>
            Questions about these Terms can be sent through our{" "}
            <Link href="/support" className="underline font-bold hover:text-accent">
              support page
            </Link>
            , or by email at{" "}
            <a href="mailto:legal@lucide.in" className="underline font-bold hover:text-accent">
              legal@lucide.in
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
