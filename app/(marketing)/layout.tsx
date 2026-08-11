import type { ReactNode } from "react";
import MarketingNavbar from "@/components/marketing/marketing-navbar";
import MarketingFooter from "@/components/marketing/marketing-footer";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-[#FDFBF7] dark:bg-zinc-950 flex flex-col overflow-x-hidden">
      {/* Vintage Technical Grid Overlay */}
      <div
        className="absolute inset-0 pointer-events-none z-0 bg-[linear-gradient(to_right,#e5e2db_1px,transparent_1px),linear-gradient(to_bottom,#e5e2db_1px,transparent_1px)] bg-[size:40px_40px] opacity-75 dark:opacity-5 dark:bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)]"
      />

      {/* Shared Marketing Header Menu */}
      <MarketingNavbar />

      {/* Content Stream */}
      <main className="flex-1 pt-28 md:pt-36 relative z-10">
        {children}
      </main>

      {/* Shared Marketing Footer Menu */}
      <MarketingFooter />
    </div>
  );
}
