"use client";

import Link from "next/link";
import { Sparkles, Send, Github, Twitter, MessageSquare } from "lucide-react";

export default function MarketingFooter() {
  return (
    <footer className="border-t-4 border-foreground bg-card text-card-foreground mt-20">
      <div className="max-w-6xl mx-auto px-6 py-16 md:py-24">

        {/* Footer Top Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 md:gap-8">

          {/* Brand Info & Newsletter */}
          <div className="col-span-1 md:col-span-5 space-y-6">
            <Link href="/" className="flex items-center gap-2 group w-max">
              <div className="p-1.5 border border-black bg-accent text-accent-foreground rounded-sm">
                <Sparkles className="h-5 w-5" />
              </div>
              <span className="text-xl font-black uppercase tracking-tight text-foreground">
                luman
              </span>
            </Link>

            <p className="text-sm font-bold uppercase leading-relaxed max-w-sm text-muted-foreground">
              A premium, high-contrast rich-text workspace developed by Lucide Tech. Organize thoughts, schedule calendars, and build databases under one single roof.
            </p>

            {/* Newsletter Subscription Box */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-black uppercase tracking-widest text-foreground">
                Stay updated with Luman releases
              </h4>
              <form
                onSubmit={(e) => e.preventDefault()}
                className="flex max-w-sm border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] bg-background"
              >
                <input
                  type="email"
                  placeholder="ENTER YOUR EMAIL ADDRESS"
                  required
                  className="flex-1 px-4 py-3 text-xs font-bold uppercase bg-transparent text-foreground placeholder:text-muted-foreground placeholder:font-bold focus:outline-none"
                />
                <button
                  type="submit"
                  className="p-3 border-l-2 border-black bg-accent text-accent-foreground hover:bg-foreground hover:text-background transition-colors flex items-center justify-center"
                  title="Subscribe"
                >
                  <Send className="h-4 w-4" />
                </button>
              </form>
            </div>
          </div>

          {/* Nav Maps */}
          <div className="col-span-1 md:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-8">

            {/* Product Column */}
            <div className="space-y-4">
              <h3 className="text-sm font-black uppercase tracking-wider text-foreground pb-2 border-b-2 border-black w-max">
                Product
              </h3>
              <ul className="space-y-3 text-xs font-bold uppercase text-muted-foreground">
                <li>
                  <Link href="/features" className="hover:text-foreground hover:underline transition-all">
                    Editor Features
                  </Link>
                </li>
                <li>
                  <Link href="/pricing" className="hover:text-foreground hover:underline transition-all">
                    Subscription Plans
                  </Link>
                </li>
                <li>
                  <Link href="/support" className="hover:text-foreground hover:underline transition-all">
                    Support Guides
                  </Link>
                </li>
              </ul>
            </div>

            {/* Tenant Column */}
            <div className="space-y-4">
              <h3 className="text-sm font-black uppercase tracking-wider text-foreground pb-2 border-b-2 border-black w-max">
                Tenants
              </h3>
              <ul className="space-y-3 text-xs font-bold uppercase text-muted-foreground">
                <li>
                  <Link href="/org-login" className="hover:text-foreground hover:underline transition-all">
                    Select Organization
                  </Link>
                </li>
                <li>
                  <Link href="/org-register" className="hover:text-foreground hover:underline transition-all">
                    Create Organization
                  </Link>
                </li>
              </ul>
            </div>

            {/* Company Column */}
            <div className="space-y-4 col-span-2 sm:col-span-1">
              <h3 className="text-sm font-black uppercase tracking-wider text-foreground pb-2 border-b-2 border-black w-max">
                Company
              </h3>
              <ul className="space-y-3 text-xs font-bold uppercase text-muted-foreground">
                <li>
                  <Link href="/about" className="hover:text-foreground hover:underline transition-all">
                    About Luman
                  </Link>
                </li>
              </ul>
            </div>

          </div>
        </div>

        {/* Footer Bottom Border */}
        <hr className="border-2 border-black my-12" />

        {/* Footer Bottom Metadata */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-6 text-xs font-bold uppercase text-muted-foreground">
          <p>© {new Date().getFullYear()} luman. made by lucide tech.</p>

          {/* Social Badges */}
          <div className="flex items-center gap-3">
            <a
              href="https://github.com"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2.5 border border-black bg-background text-foreground shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] hover-brutal"
            >
              <Github className="h-4 w-4" />
            </a>
            <a
              href="https://twitter.com"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2.5 border border-black bg-background text-foreground shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] hover-brutal"
            >
              <Twitter className="h-4 w-4" />
            </a>
            <a
              href="https://discord.com"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2.5 border border-black bg-background text-foreground shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] hover-brutal"
            >
              <MessageSquare className="h-4 w-4" />
            </a>
          </div>
        </div>

      </div>
    </footer>
  );
}
