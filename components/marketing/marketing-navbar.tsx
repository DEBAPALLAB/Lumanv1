"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, Menu, X } from "lucide-react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";

export default function MarketingNavbar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const navLinks = [
    { name: "Features", href: "/features" },
    { name: "Pricing", href: "/pricing" },
    { name: "About", href: "/about" },
    { name: "Support", href: "/support" },
  ];

  return (
    <nav className="fixed top-4 left-0 right-0 z-50 px-4 md:px-8">
      {/* Outer Container for Floating Capsule */}
      <div className="max-w-6xl mx-auto border-brutal bg-background/95 backdrop-blur-md px-6 py-4 shadow-brutal flex items-center justify-between transition-all duration-300">

        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="p-1.5 border border-black bg-accent text-accent-foreground rounded-sm transition-transform group-hover:rotate-12">
            <Sparkles className="h-5 w-5" />
          </div>
          <span className="text-2xl font-black uppercase tracking-tight text-foreground select-none">
            luman
          </span>
        </Link>

        {/* Desktop Navigation Links */}
        <div className="hidden md:flex items-center gap-1.5">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.name}
                href={link.href}
                className={cn(
                  "px-4 py-2 text-sm font-bold uppercase border border-transparent rounded-md transition-all hover:bg-muted/80 hover:border-black",
                  isActive && "bg-muted border-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]"
                )}
              >
                {link.name}
              </Link>
            );
          })}
        </div>

        {/* Action Controls & Authentication CTAs */}
        <div className="hidden md:flex items-center gap-4">
          <ThemeToggle />

          <Link
            href="/org-login"
            className="px-4 py-2 text-sm font-bold uppercase transition-all hover:text-accent"
          >
            Log In
          </Link>

          <Link
            href="/org-register"
            className="px-5 py-2.5 text-sm font-black uppercase border border-black bg-accent text-accent-foreground shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] transition-all"
          >
            Try for Free
          </Link>
        </div>

        {/* Mobile Control Section */}
        <div className="flex items-center gap-3 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 border border-black bg-card shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] hover-brutal text-foreground"
          >
            {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Overlay */}
      {isOpen && (
        <div className="absolute top-20 left-4 right-4 z-40 md:hidden border-brutal bg-background p-6 shadow-brutal-lg animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="flex flex-col gap-4">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className={cn(
                  "py-3 px-4 text-lg font-black uppercase border border-transparent rounded-sm hover:bg-muted hover:border-black",
                  pathname === link.href && "bg-muted border-black"
                )}
              >
                {link.name}
              </Link>
            ))}

            <hr className="border-2 border-foreground my-2" />

            <Link
              href="/org-login"
              onClick={() => setIsOpen(false)}
              className="py-3 px-4 text-lg font-black uppercase border border-black bg-card text-center shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none transition-all active:scale-95"
            >
              Log In
            </Link>

            <Link
              href="/org-register"
              onClick={() => setIsOpen(false)}
              className="py-3.5 px-4 text-lg font-black uppercase border border-black bg-accent text-accent-foreground text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none transition-all active:scale-95"
            >
              Try for Free
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
