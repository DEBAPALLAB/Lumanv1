import Link from "next/link";
import { Sparkles, ArrowRight, HelpCircle } from "lucide-react";

export default function PricingPage() {
  const plans = [
    {
      name: "Starter",
      description: "PERFECT FOR INDIVIDUALS AND SMALL TEAMS",
      price: "$0",
      period: "forever",
      color: "bg-card",
      buttonText: "Create Free Workspace",
      href: "/org-register",
      shadow: "shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]",
      features: [
        "1 Shared Workspace",
        "Up to 3 Active Directories",
        "Clean, intuitive document editor",
        "Smart shortcuts (tables and lists)",
        "Basic file storage for documents",
      ],
    },
    {
      name: "Professional",
      description: "MOST POPULAR FOR GROWING TEAMS",
      price: "$12",
      period: "per user / month",
      color: "bg-[#FCD34D]", // Vibrant accent yellow
      buttonText: "Get Pro Now",
      href: "/org-register",
      popular: true,
      shadow: "shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]",
      features: [
        "Unlimited Documents & Folders",
        "Smart AI Assistant Sidebar",
        "Interactive schedule planning",
        "Expanded file storage for documents",
        "Secure team invite codes",
        "Priority email response support",
      ],
    },
    {
      name: "Enterprise",
      description: "FOR LARGER TEAMS NEEDING ADVANCED CONTROLS",
      price: "$39",
      period: "per workspace / month",
      color: "bg-[#FCA5A5]", // Pastel coral red
      buttonText: "Get Enterprise",
      href: "/org-register",
      shadow: "shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]",
      features: [
        "Unlimited Documents, Folders & Storage",
        "Flexible LLM API integrations",
        "Custom permission controls",
        "Unlimited file storage quotas",
        "Dedicated workspace success manager",
        "Guaranteed priority uptime support",
      ],
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-6 space-y-16">
      
      {/* Header */}
      <div className="space-y-4 max-w-3xl">
        <div className="inline-block px-3 py-1 border border-black bg-accent text-accent-foreground text-xs font-black uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          ⚡ SIMPLE PRICING
        </div>
        <h1 className="text-4xl sm:text-6xl font-black uppercase text-foreground leading-none">
          CHOOSE YOUR PLAN
        </h1>
        <p className="text-sm font-bold uppercase text-muted-foreground leading-relaxed">
          Simple, high-value subscription tiers. Scale your workspace directories as your execution team accelerates.
        </p>
      </div>

      <hr className="border-2 border-black" />

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch pt-6">
        {plans.map((plan, index) => (
          <div 
            key={index} 
            className={`border-brutal-thick ${plan.color} text-foreground p-8 flex flex-col justify-between space-y-8 relative ${
              plan.popular ? "scale-[1.03] z-10" : ""
            } ${plan.shadow}`}
          >
            {plan.popular && (
              <div className="absolute -top-3.5 left-4 px-2.5 py-0.5 bg-black text-white text-[9px] font-black uppercase border border-black flex items-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]">
                <Sparkles className="h-3 w-3 text-yellow-400" />
                MOST POPULAR
              </div>
            )}

            <div className="space-y-6">
              <div>
                <h3 className="text-2xl font-black uppercase">{plan.name}</h3>
                <p className="text-[9px] font-black tracking-widest text-muted-foreground uppercase pt-1">
                  {plan.description}
                </p>
              </div>

              {/* Price Tag */}
              <div className="py-4 border-y border-black/20 flex items-baseline gap-2">
                <span className="text-5xl font-black">{plan.price}</span>
                <span className="text-[10px] font-black uppercase text-muted-foreground">
                  / {plan.period}
                </span>
              </div>

              {/* Feature List */}
              <ul className="space-y-3.5">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-2.5 text-xs font-bold uppercase">
                    <Check className="h-4 w-4 text-green-600 shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* CTA Button */}
            <Link
              href={plan.href}
              className={`w-full py-4 text-xs font-black uppercase border border-black text-center shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] transition-all flex items-center justify-center gap-2 ${
                plan.popular ? "bg-black text-white" : "bg-background text-foreground"
              }`}
            >
              {plan.buttonText}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ))}
      </div>

      {/* FAQs Panel */}
      <div className="border-brutal-thick bg-card shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] rounded-sm overflow-hidden mt-12">
        
        {/* Header Bar */}
        <div className="border-b-2 border-black bg-accent px-6 py-4 flex items-center gap-2 text-accent-foreground">
          <HelpCircle className="h-5 w-5 shrink-0" />
          <h4 className="text-sm font-black uppercase tracking-wider">
            Billing FAQ & Workspace Setup
          </h4>
        </div>
        
        {/* Q&A Content */}
        <div className="p-6 md:p-8 grid grid-cols-1 sm:grid-cols-2 gap-8 text-xs font-bold uppercase text-muted-foreground">
          
          {/* Question 1 */}
          <div className="space-y-2 border-l-4 border-[#A78BFA] pl-4">
            <h5 className="text-foreground text-sm font-black uppercase">
              Can I cancel my plan anytime?
            </h5>
            <p className="leading-relaxed font-semibold">
              Yes. You can manage, upgrade, or cancel your team's plan directly inside your Luman organization settings at any time with no penalties.
            </p>
          </div>
          
          {/* Question 2 */}
          <div className="space-y-2 border-l-4 border-[#FB923C] pl-4">
            <h5 className="text-foreground text-sm font-black uppercase">
              Are there any hidden setup fees?
            </h5>
            <p className="leading-relaxed font-semibold">
              No. Creating your Luman workspace is entirely instant and free, and there are absolutely no administrative onboarding costs or surprise fees.
            </p>
          </div>

        </div>
      </div>

    </div>
  );
}

// Help check component
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
