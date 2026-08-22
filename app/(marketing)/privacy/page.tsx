import { ShieldCheck } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Luman",
  description: "How Luman collects, uses, and protects your data.",
};

const UPDATED = "August 22, 2026";

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 space-y-16 pb-24">
      <div className="space-y-4 max-w-3xl">
        <div className="inline-block px-3 py-1 border border-black bg-accent text-accent-foreground text-xs font-black uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          <ShieldCheck className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
          Legal
        </div>
        <h1 className="text-4xl sm:text-6xl font-black uppercase text-foreground leading-none">Privacy Policy</h1>
        <p className="text-xs font-bold uppercase text-muted-foreground">Last updated {UPDATED}</p>
      </div>

      <hr className="border-2 border-black" />

      <div className="space-y-12 text-sm leading-relaxed text-foreground">
        <section className="space-y-3">
          <p>
            Luman is a workspace product built by Lucide Tech ("Lucide Tech," "we," "us"). This policy explains what
            information Luman collects when you use the app at luman.lucide.in or the Luman desktop app, why we collect
            it, and the choices you have. It applies to every Luman product surface: the marketing site, the desktop
            workspace, and the underlying API.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-black uppercase border-b-2 border-black w-max pb-1">1. Information we collect</h2>
          <p className="font-bold uppercase text-xs tracking-wide text-muted-foreground pt-2">Account information</p>
          <p>
            When you sign up or sign in — including with "Continue with Google" — we receive your name, email address,
            and profile picture from the identity provider. Signing in with Google only requests your basic Google
            profile (name, email address, profile photo). Luman does not request access to your Gmail, Google Drive,
            Google Calendar, or any other Google service — the sign-in is used strictly to authenticate you, not to read
            or write data in your Google account.
          </p>
          <p className="font-bold uppercase text-xs tracking-wide text-muted-foreground pt-2">Content you create</p>
          <p>
            Luman stores what you put into it: notes and documents, tasks and their due dates, calendar events, chat
            messages, whiteboard content, uploaded files, and the organizations and workspaces you create or join. This
            content is stored so the product can function — showing your notes back to you, syncing tasks across your
            team, and so on.
          </p>
          <p className="font-bold uppercase text-xs tracking-wide text-muted-foreground pt-2">Voice input</p>
          <p>
            If you use Luman's voice agent, your recorded audio is sent to our transcription and text-to-speech
            providers solely to convert your speech to text and to generate a spoken reply. Audio clips are not stored
            by Luman after the request completes; see "Third-party processors" below for who performs the transcription
            and speech synthesis and their own data handling.
          </p>
          <p className="font-bold uppercase text-xs tracking-wide text-muted-foreground pt-2">Usage data</p>
          <p>
            We collect standard technical data — IP address, browser type, device information, and log timestamps — to
            keep the service secure, debug issues, and understand basic usage patterns.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-black uppercase border-b-2 border-black w-max pb-1">
            2. How we use your information
          </h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>To create and authenticate your account, and to keep you signed in.</li>
            <li>To operate the core product: storing and displaying your notes, tasks, calendar, chats, and files.</li>
            <li>
              To let you invite teammates to a shared organization or workspace, and to show them your name and email as
              the author of shared content.
            </li>
            <li>To transcribe voice commands and generate spoken replies when you use the voice agent.</li>
            <li>To respond to support requests you send us.</li>
            <li>To detect, investigate, and prevent abuse, security incidents, and violations of our terms.</li>
          </ul>
          <p>We do not sell your personal information, and we do not use your notes or documents to train AI models.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-black uppercase border-b-2 border-black w-max pb-1">3. Third-party processors</h2>
          <p>
            Luman relies on a small number of infrastructure providers to operate. Each only receives the data it needs
            to perform its specific function, and each is bound by its own privacy and security terms.
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <span className="font-bold">Supabase</span> — hosts our database and authentication, and processes Google
              OAuth sign-in.
            </li>
            <li>
              <span className="font-bold">OpenRouter</span> — processes text sent to the voice agent and AI assistant so
              a language model can interpret commands or generate assistant replies.
            </li>
            <li>
              <span className="font-bold">Groq</span> — transcribes voice recordings into text when you use the voice
              agent.
            </li>
            <li>
              <span className="font-bold">ElevenLabs</span> — converts the voice agent's text replies into spoken audio.
            </li>
            <li>
              <span className="font-bold">Vercel</span> — hosts the Luman application and web infrastructure.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-black uppercase border-b-2 border-black w-max pb-1">
            4. Data sharing within your organization
          </h2>
          <p>
            Luman is built around shared organizations and workspaces. Content you create inside a shared workspace —
            notes, tasks, chat messages, calendar events, files — is visible to other members of that workspace
            according to the role and permissions your organization administrator sets. Your name and email are visible
            to teammates you share a workspace with, so they know who created or edited what.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-black uppercase border-b-2 border-black w-max pb-1">5. Data retention</h2>
          <p>
            We retain your account and content for as long as your account is active. If you delete a note, task, or
            other item, it is removed from active use; if you delete your account, we delete or anonymize your personal
            information within a reasonable period, except where we are required to retain it by law or for legitimate
            business purposes such as fraud prevention.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-black uppercase border-b-2 border-black w-max pb-1">
            6. Your choices and rights
          </h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>You can access, edit, or delete most of your content directly inside Luman.</li>
            <li>
              You can request a copy of your personal information, or ask us to delete your account and associated data,
              by contacting us (see "Contact" below).
            </li>
            <li>
              If you are in the EEA, UK, or a jurisdiction with similar data protection law, you have rights to access,
              correct, delete, or port your data, and to object to or restrict certain processing.
            </li>
            <li>
              You can revoke Luman's access to your Google account at any time from your{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-bold hover:text-accent"
              >
                Google Account permissions page
              </a>
              .
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-black uppercase border-b-2 border-black w-max pb-1">7. Security</h2>
          <p>
            We use industry-standard measures — encryption in transit, access controls, and row-level security on our
            database — to protect your data. No method of storage or transmission is completely secure, so we cannot
            guarantee absolute security.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-black uppercase border-b-2 border-black w-max pb-1">8. Children's privacy</h2>
          <p>
            Luman is not directed at children under 13, and we do not knowingly collect personal information from them.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-black uppercase border-b-2 border-black w-max pb-1">9. Changes to this policy</h2>
          <p>
            We may update this policy as Luman changes. If we make material changes, we will update the "Last updated"
            date above and, where appropriate, notify you directly.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-black uppercase border-b-2 border-black w-max pb-1">10. Contact</h2>
          <p>
            Questions about this policy or your data can be sent through our{" "}
            <Link href="/support" className="underline font-bold hover:text-accent">
              support page
            </Link>
            , or by email at{" "}
            <a href="mailto:privacy@lucide.in" className="underline font-bold hover:text-accent">
              privacy@lucide.in
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}
