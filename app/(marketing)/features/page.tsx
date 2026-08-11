import Link from "next/link";
import { 
  Sparkles, 
  Terminal, 
  Lock, 
  UploadCloud, 
  Calendar, 
  ListTodo, 
  ArrowRight,
  BookOpen,
  LayoutGrid
} from "lucide-react";

export default function FeaturesPage() {
  const features = [
    {
      title: "Interactive Document Editor",
      subtitle: "SPEED-FOCUSED WRITING & FORMATTING",
      color: "bg-[#93C5FD]", // Sky Blue
      icon: <BookOpen className="h-6 w-6" />,
      description: "A fast, clean document editor designed for rapid creation. Insert headers, format tasks, add bullet logs, and structure goals without touching your mouse.",
      bullets: [
        "Smart shortcuts for tables, lists, and headings (just type '/')",
        "Highlight any paragraph to summon helpful AI writing tools",
        "Add clean, structured tables to organize text and goals",
        "Drag and drop images, PDFs, and spreadsheets directly into your pages",
      ],
    },
    {
      title: "Flexible Roles & Permissions",
      subtitle: "SECURE ACCESS CONTROL FOR ORGANIZATIONS",
      color: "bg-[#FCA5A5]", // Pastel Red
      icon: <Lock className="h-6 w-6" />,
      description: "Keep your sensitive notes, plans, and directories safe. Grant managers full control and give team members permission levels appropriate for their work.",
      bullets: [
        "Secure organization codes to invite teammates safely",
        "Admin Roles (full privileges) vs Member Roles (view/contribute only)",
        "Organize files in color-coded project directories",
        "Completely private workspaces isolated from other organizations",
      ],
    },
    {
      title: "AI Assistant Sidebar",
      subtitle: "YOUR DEDICATED WRITING COMPANION",
      color: "bg-[#FCD34D]", // Accent Yellow
      icon: <Sparkles className="h-6 w-6" />,
      description: "Brainstorm details and write strategies side-by-side with an AI assistant. Simply highlight a section of your document to rewrite, edit, or summarize instantly.",
      bullets: [
        "Words stream onto your screen instantly",
        "Quick templates for editing, simplifying, and outlining copies",
        "Replace highlighted sentences in documents with one click",
        "Keep active chat prompts open right next to your workspace",
      ],
    },
    {
      title: "Team Schedules & Checklists",
      subtitle: "COORDINATED REALTIME TIMELINES",
      color: "bg-[#C084FC]", // Lavender
      icon: <Calendar className="h-6 w-6" />,
      description: "Plan project milestones, map deadlines, and coordinate schedules alongside active checklists. Keep your files, team calendars, and progress markers fully synced.",
      bullets: [
        "Visual monthly calendar grid highlighting team event days",
        "Action checklists that auto-update your workspace dashboard status",
        "Link calendar events directly to strategic note folders",
        "Instant updates keep the entire team synchronized in real-time",
      ],
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-6 space-y-16">
      
      {/* Page Header */}
      <div className="space-y-4 max-w-3xl">
        <div className="inline-block px-3 py-1 border border-black bg-accent text-accent-foreground text-xs font-black uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          ⚡ PRODUCT FEATURES
        </div>
        <h1 className="text-4xl sm:text-6xl font-black uppercase text-foreground leading-none">
          PRODUCT CAPABILITIES
        </h1>
        <p className="text-sm font-bold uppercase text-muted-foreground leading-relaxed">
          Explore the intuitive tools built into Luman. Everything you need to focus, align your team, and accelerate execution.
        </p>
      </div>

      <hr className="border-2 border-black" />

      {/* Feature Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-6">
        {features.map((feat, index) => (
          <div 
            key={index} 
            className="border-brutal-thick shadow-brutal-lg bg-card p-8 flex flex-col justify-between space-y-8"
          >
            <div className="space-y-6">
              
              {/* Header badge */}
              <div className="flex items-center justify-between pb-4 border-b-2 border-black">
                <div className="flex items-center gap-2">
                  <div className={`p-2 border border-black rounded-sm text-black ${feat.color}`}>
                    {feat.icon}
                  </div>
                  <div>
                    <h3 className="text-lg font-black uppercase text-foreground">
                      {feat.title}
                    </h3>
                    <p className="text-[9px] font-black tracking-widest text-muted-foreground uppercase">
                      {feat.subtitle}
                    </p>
                  </div>
                </div>
              </div>

              {/* Main description */}
              <p className="text-xs font-semibold uppercase leading-relaxed text-muted-foreground">
                {feat.description}
              </p>

              {/* Bullet list */}
              <ul className="space-y-3.5 pt-2">
                {feat.bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-xs font-bold uppercase text-foreground">
                    <Check className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>

            </div>

            {/* CTA button */}
            <Link
              href="/org-register"
              className="w-full py-4 text-xs font-black uppercase border border-black text-center bg-background text-foreground shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] transition-all flex items-center justify-center gap-2"
            >
              Get Started with Luman
              <ArrowRight className="h-4 w-4" />
            </Link>

          </div>
        ))}
      </div>

      {/* CTA Box */}
      <div className="border-brutal-mega bg-foreground text-background p-12 text-center space-y-6">
        <h2 className="text-2xl sm:text-4xl font-black uppercase leading-tight">
          BRING YOUR TEAM ALIVE TODAY
        </h2>
        <p className="text-xs font-bold uppercase max-w-xl mx-auto leading-relaxed opacity-85">
          Deploy a clean, secure private workspace for your thoughts, tasks, and team scheduling.
        </p>
        <Link
          href="/org-register"
          className="inline-flex items-center gap-2 px-8 py-4 text-sm font-black uppercase border-2 border-black bg-accent text-accent-foreground shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all"
        >
          Spawn Your Workspace
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

    </div>
  );
}

// Helper SVG Check Component
function Check({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={3}
      stroke="currentColor"
      className={className}
      {...props}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}
