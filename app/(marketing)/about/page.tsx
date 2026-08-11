import Link from "next/link";
import { Sparkles, Terminal, Shield, Cpu, Code } from "lucide-react";

export default function AboutPage() {
  const corePrinciples = [
    {
      title: "Clean, High-Contrast Design",
      icon: <Sparkles className="h-6 w-6 text-yellow-500" />,
      color: "bg-[#FCD34D]",
      desc: "We ditch weak blurs and confusing buttons. Luman features clean outlines and bold borders that keep your writing readable and your plans fully focused.",
    },
    {
      title: "Speed-Focused Shortcuts",
      icon: <Cpu className="h-6 w-6 text-blue-500" />,
      color: "bg-[#93C5FD]",
      desc: "Format headings, insert list logs, create tables, or sync schedule dates in seconds. Luman is designed to help you work quickly without touching your mouse.",
    },
    {
      title: "Simple Access Controls",
      icon: <Shield className="h-6 w-6 text-red-500" />,
      color: "bg-[#FCA5A5]",
      desc: "Keep your key strategies and files safe. Simple role permissions ensure team members can contribute without accidentally moving or deleting shared project folders.",
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-6 space-y-24">
      
      {/* Header Section */}
      <div className="space-y-4 max-w-3xl">
        <div className="inline-block px-3 py-1 border border-black bg-accent text-accent-foreground text-xs font-black uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          ⚡ OUR MISSION
        </div>
        <h1 className="text-4xl sm:text-6xl font-black uppercase text-foreground leading-none">
          ABOUT LUMAN
        </h1>
        <p className="text-sm font-bold uppercase text-muted-foreground leading-relaxed">
          Luman is a beautiful, highly polished workspace developed by Lucide Tech to help teams organize thoughts, coordinate plans, and execute goals.
        </p>
      </div>

      <hr className="border-2 border-black" />

      {/* Core Principles Grid */}
      <div className="space-y-8">
        <h2 className="text-2xl sm:text-3xl font-black uppercase text-foreground">
          OUR THREE PILLARS
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {corePrinciples.map((princ, idx) => (
            <div 
              key={idx} 
              className="border-brutal bg-card p-6 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] space-y-4"
            >
              <div className={`p-2 border border-black rounded-sm w-max ${princ.color}`}>
                {princ.icon}
              </div>
              <h3 className="text-base font-black uppercase">{princ.title}</h3>
              <p className="text-xs font-semibold uppercase leading-relaxed text-muted-foreground">
                {princ.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Brand CTA */}
      <div className="border-brutal bg-[#C084FC] text-black p-8 md:p-12 text-center space-y-6 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
        <h2 className="text-xl sm:text-3xl font-black uppercase">
          SPAWN YOUR TEAM WORKSPACE
        </h2>
        <p className="text-xs font-bold uppercase max-w-lg mx-auto leading-relaxed">
          Create structured note folders, coordinate action checklists, and keep everyone aligned under one shared roof.
        </p>
        <Link
          href="/org-register"
          className="inline-flex items-center gap-2 px-6 py-3 text-xs font-black uppercase border border-black bg-white text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] transition-all"
        >
          Create Organization
        </Link>
      </div>

    </div>
  );
}
