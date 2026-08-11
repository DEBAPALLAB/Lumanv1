"use client";

import { createSupabaseClient } from "@/lib/supabase/client";
import { ArrowLeft, Building2, Sparkles, FileText, CheckSquare, Calendar, Sparkle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgSlug = searchParams.get("org");
  const registered = searchParams.get("registered");

  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [inviteCode, setInviteCode] = useState("");

  useEffect(() => {
    // Get organization name from session storage
    const storedOrgName = sessionStorage.getItem("selected_org_name");
    if (storedOrgName) {
      setOrgName(storedOrgName);
    } else if (!orgSlug) {
      // No organization selected, redirect to org login
      router.push("/org-login");
      return;
    }

    // Check if user is already logged in
    async function checkExistingSession() {
      if (!orgSlug) return;
      try {
        const res = await fetch(`/api/auth/session?org=${orgSlug}`);
        if (res.ok) {
          // User is logged in and belongs to this organization, redirect to dashboard
          router.push(`/dashboard?org=${orgSlug}`);
        } else if (res.status === 403) {
          // User is logged in but is NOT a member of this organization.
          // Sign them out of the incorrect account so they can log in clean!
          const supabase = createSupabaseClient();
          await supabase.auth.signOut();
        }
      } catch (err) {
        // Ignore - user stays on login page and can retry.
      }
    }

    checkExistingSession();
  }, [orgSlug, router]);

  async function handleGoogleSignIn() {
    setError("");
    setLoading(true);

    try {
      if (inviteCode) {
        const verifyRes = await fetch("/api/auth/verify-invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orgSlug, code: inviteCode.toUpperCase() }),
        });

        const verifyData = await verifyRes.json();
        if (!verifyRes.ok || !verifyData.success) {
          setError(verifyData.error || "Invalid Organization Invite Code");
          setLoading(false);
          return;
        }
      }

      const supabase = createSupabaseClient();

      // Store org slug in a cookie that expires in 10 minutes
      document.cookie = `sb_org_slug=${orgSlug}; path=/; max-age=600; SameSite=Lax`;

      // Sign in with Google OAuth
      const { data, error: authError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?org=${orgSlug}`,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen w-full bg-[#FDFBF7] dark:bg-zinc-950 flex flex-col lg:flex-row overflow-hidden font-sans relative">

      {/* 1. LEFT SIDE - PREMIUM INFO SHOWCASE OF WHAT LUMAN DOES (Pure CSS tactile visual cards matching website colors) */}
      <div className="hidden lg:flex lg:w-7/12 bg-[#FDFBF7] dark:bg-zinc-950 relative overflow-hidden flex-col justify-center p-16 xl:p-20 border-r-[4px] border-black">

        {/* Retro Grid Background Overlay */}
        <div
          className="absolute inset-0 pointer-events-none z-0 bg-[linear-gradient(to_right,#e5e2db_1px,transparent_1px),linear-gradient(to_bottom,#e5e2db_1px,transparent_1px)] bg-[size:40px_40px] opacity-60 dark:opacity-5 dark:bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)]"
        />

        {/* Ambient Pastel Glows matching Luman style */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-yellow-200/20 dark:bg-yellow-500/5 rounded-full filter blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-200/20 dark:bg-emerald-500/5 rounded-full filter blur-[100px] pointer-events-none" />

        {/* Brand Showcase Header */}
        <div className="space-y-4 mb-10 relative z-10 max-w-lg">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-accent border border-black text-accent-foreground rounded-full text-[10px] font-black uppercase tracking-wider shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]">
            <Sparkle className="w-3.5 h-3.5 animate-spin-slow" />
            Luman Workspace Gateway
          </div>

          <h2 className="text-4xl xl:text-5xl font-black text-foreground uppercase tracking-tight leading-[1.1]">
            Organize <span className="text-[#059669] dark:text-[#34D399]">ideas</span>.
            <br />
            Coordinate <span className="text-[#D97706] dark:text-[#FBBF24]">teams</span>.
          </h2>

          <p className="text-sm text-muted-foreground font-bold uppercase tracking-wide leading-relaxed">
            A collaborative workspace combining smart documentation, shared agendas, and fast task boards.
          </p>
        </div>

        {/* Tactile Pure CSS Feature Cards (Showing what we do) */}
        <div className="space-y-6 max-w-xl relative z-10">

          {/* Card A: Document Writing with AI */}
          <div className="bg-[#FDFBF7] dark:bg-zinc-900 text-foreground border-[3px] border-black p-5 rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:shadow-[6px_6px_0px_0px_rgba(255,255,255,1)] relative transform hover:-rotate-1 transition-all duration-300">
            <div className="absolute -top-3 right-5 px-3 py-1 border-2 border-black bg-[#F9A8D4] text-[9px] font-black uppercase rounded-full shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] text-black">
              ✍️ AI Copilot
            </div>

            <div className="flex gap-4">
              <div className="p-3 border-2 border-black bg-[#D1FAE5] rounded-xl shrink-0 h-min text-black">
                <FileText className="w-6 h-6 stroke-[2.5]" />
              </div>
              <div className="space-y-2 flex-grow">
                <h3 className="text-sm font-black uppercase tracking-tight">Structured Document Hub</h3>
                <div className="border border-black/10 dark:border-white/10 rounded-lg p-2.5 bg-black/[0.02] dark:bg-white/[0.02] text-[10px] font-bold text-muted-foreground space-y-1.5 font-mono">
                  <div className="text-foreground">📄 launch_goals.md</div>
                  <div className="w-full h-1 bg-muted-foreground/20 rounded" />
                  <div className="w-5/6 h-1 bg-muted-foreground/20 rounded" />
                  <div className="bg-[#FBBF24]/30 border border-[#FBBF24] p-1.5 rounded text-[9px] font-black text-foreground">
                    💡 AI: "Drafting 3 milestone goals for the calendar sync..."
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card B: Live Interactive Task Checklists */}
          <div className="bg-[#FBBF24] text-black border-[3px] border-black p-5 rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:shadow-[6px_6px_0px_0px_rgba(255,255,255,1)] relative transform hover:rotate-1 transition-all duration-300">
            <div className="absolute -top-3 right-5 px-3 py-1 border-2 border-black bg-[#34D399] text-[9px] font-black uppercase rounded-full shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              📋 Adaptive Checklists
            </div>

            <div className="flex gap-4">
              <div className="p-3 border-2 border-black bg-white rounded-xl shrink-0 h-min">
                <CheckSquare className="w-6 h-6 stroke-[2.5]" />
              </div>
              <div className="space-y-2 flex-grow">
                <h3 className="text-sm font-black uppercase tracking-tight">Team Action Tracker</h3>
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase text-black/80">
                    <span className="w-4 h-4 border-2 border-black rounded-md bg-black flex items-center justify-center text-white text-[8px]">✓</span>
                    <span className="line-through">Finalize layout specifications</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase text-black">
                    <span className="w-4 h-4 border-2 border-black rounded-md bg-white flex items-center justify-center font-black">/</span>
                    <span>Test AI writing partner editor</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card C: Shared Multi-Tenant Calendar */}
          <div className="bg-[#34D399] text-black border-[3px] border-black p-5 rounded-2xl shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] dark:shadow-[6px_6px_0px_0px_rgba(255,255,255,1)] relative transform hover:-rotate-1 transition-all duration-300">
            <div className="absolute -top-3 right-5 px-3 py-1 border-2 border-black bg-[#FBBF24] text-[9px] font-black uppercase rounded-full shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              📅 Shared Agendas
            </div>

            <div className="flex gap-4">
              <div className="p-3 border-2 border-black bg-white rounded-xl shrink-0 h-min">
                <Calendar className="w-6 h-6 stroke-[2.5]" />
              </div>
              <div className="space-y-2 flex-grow">
                <h3 className="text-sm font-black uppercase tracking-tight">Multi-Tenant Calendar</h3>
                <div className="grid grid-cols-4 gap-2 pt-1">
                  <div className="border border-black/10 rounded p-1 bg-white/40 text-center">
                    <span className="block text-[7px] font-black uppercase opacity-60">Mon</span>
                    <span className="w-1.5 h-1.5 bg-[#EA580C] rounded-full mx-auto mt-1 block" />
                  </div>
                  <div className="border border-black/10 rounded p-1 bg-white/40 text-center">
                    <span className="block text-[7px] font-black uppercase opacity-60">Tue</span>
                    <span className="w-1.5 h-1.5 bg-[#2563EB] rounded-full mx-auto mt-1 block" />
                  </div>
                  <div className="border border-black/20 rounded p-1 bg-white text-center shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
                    <span className="block text-[7px] font-black uppercase">Wed</span>
                    <span className="w-1.5 h-1.5 bg-[#EF4444] rounded-full mx-auto mt-1 block animate-ping" />
                  </div>
                  <div className="border border-black/10 rounded p-1 bg-white/40 text-center">
                    <span className="block text-[7px] font-black uppercase opacity-60">Thu</span>
                    <span className="w-1.5 h-1.5 bg-[#10B981] rounded-full mx-auto mt-1 block" />
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* 2. RIGHT SIDE - DYNAMIC CREATIVE LOGIN FORM CARD */}
      <div className="w-full lg:w-5/12 flex items-center justify-center p-6 sm:p-12 relative z-10 min-h-screen">

        {/* Canvas Retro Grid Background Overlay */}
        <div
          className="absolute inset-0 pointer-events-none z-0 bg-[linear-gradient(to_right,#e5e2db_1px,transparent_1px),linear-gradient(to_bottom,#e5e2db_1px,transparent_1px)] bg-[size:40px_40px] opacity-40 dark:opacity-5 dark:bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)]"
        />

        {/* Floating Back Action Capsule */}
        <Link
          href="/org-login"
          className="absolute top-6 left-6 px-5 py-2.5 border-2 border-black bg-card text-foreground shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,1)] rounded-full hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-none transition-all flex items-center gap-2 text-xs font-black uppercase z-20"
        >
          <ArrowLeft className="h-4 w-4" />
          Change Org
        </Link>

        {/* Redesigned Card Container matching product canvas theme */}
        <div className="relative w-full max-w-[480px] border-[4px] border-black bg-[#FDFBF7] dark:bg-zinc-900 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] dark:shadow-[12px_12px_0px_0px_rgba(255,255,255,1)] rounded-[36px] overflow-hidden my-auto flex flex-col justify-between p-8 sm:p-10 min-h-[560px]">

          {/* A: Diagonal Stripes (Top-Left corner vector doodle - highly subtle) */}
          <div className="absolute top-0 left-0 w-24 h-24 overflow-hidden pointer-events-none opacity-40">
            <svg className="w-full h-full text-foreground/[0.04] stroke-current" viewBox="0 0 100 100" fill="none">
              <line x1="-20" y1="20" x2="20" y2="-20" strokeWidth="4" />
              <line x1="-20" y1="40" x2="40" y2="-20" strokeWidth="4" />
              <line x1="-20" y1="60" x2="60" y2="-20" strokeWidth="4" />
              <line x1="-20" y1="80" x2="80" y2="-20" strokeWidth="4" />
              <line x1="-20" y1="100" x2="100" y2="-20" strokeWidth="4" />
              <line x1="0" y1="100" x2="100" y2="0" strokeWidth="4" />
              <line x1="20" y1="100" x2="100" y2="20" strokeWidth="4" />
              <line x1="40" y1="100" x2="100" y2="40" strokeWidth="4" />
              <line x1="60" y1="100" x2="100" y2="60" strokeWidth="4" />
            </svg>
          </div>

          {/* B: Yellow 4-point Sparkles/Stars */}
          <svg className="absolute top-6 right-6 w-8 h-8 text-[#FBBF24] fill-current animate-pulse" viewBox="0 0 24 24">
            <path d="M12 0L14.6 9.4L24 12L14.6 14.6L12 24L9.4 14.6L0 12L9.4 9.4L12 0Z" />
          </svg>
          <svg className="absolute bottom-28 left-6 w-6 h-6 text-[#FCD34D] fill-current animate-bounce" viewBox="0 0 24 24">
            <path d="M12 0L14.6 9.4L24 12L14.6 14.6L12 24L9.4 14.6L0 12L9.4 9.4L12 0Z" />
          </svg>

          {/* C: Spiral Wireframe Doodle */}
          <div className="absolute left-4 top-1/2 -translate-y-1/2 w-16 h-16 pointer-events-none opacity-30">
            <svg className="w-full h-full text-indigo-500/[0.08] dark:text-indigo-400/[0.08] stroke-current" viewBox="0 0 100 100" fill="none" strokeWidth="2">
              <path d="M 50,50 A 10,10 0 1,0 60,60 A 20,20 0 1,0 40,80 A 30,30 0 1,0 70,30" />
            </svg>
          </div>

          {/* D: Flat-Vector Zigzag 3D Column (Right edge decoration) */}
          <div className="absolute right-0 bottom-6 w-16 h-48 pointer-events-none opacity-90 select-none hidden sm:block">
            <svg className="w-full h-full animate-pulse" viewBox="0 0 60 180" fill="none" style={{ animationDuration: '3s' }}>
              <path d="M10,20 L40,0 L50,15 L20,35 L50,55 L60,70 L30,90 L60,110 L70,125 L40,145 L70,165 L60,180" fill="#1E3A8A" />
              <path d="M0,30 L30,10 L30,45 L0,65 Z" fill="#F97316" />
              <path d="M0,65 L30,45 L30,80 L0,100 Z" fill="#EA580C" />
              <path d="M0,100 L30,80 L30,115 L0,135 Z" fill="#F97316" />
              <path d="M0,135 L30,115 L30,150 L0,170 Z" fill="#EA580C" />
              <path d="M30,10 L45,20 L30,45 Z" fill="#3B82F6" />
              <path d="M30,45 L45,55 L30,80 Z" fill="#2563EB" />
              <path d="M30,80 L45,90 L30,115 Z" fill="#3B82F6" />
              <path d="M30,115 L45,125 L30,150 Z" fill="#2563EB" />
            </svg>
          </div>

          {/* Card Content Wrapper */}
          <div className="space-y-8 flex-grow flex flex-col justify-between relative z-10">

            {/* Header Title Block */}
            <div className="space-y-4 text-center mt-4">
              <Link href="/" className="inline-flex items-center gap-2 group w-max mx-auto">
                <div className="p-1 border-2 border-black bg-accent text-accent-foreground rounded-lg transition-transform group-hover:rotate-12">
                  <Sparkles className="h-4 w-4" />
                </div>
                <span className="text-sm font-black uppercase tracking-widest text-foreground">
                  luman
                </span>
              </Link>

              <div className="space-y-2">
                <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-foreground">
                  Welcome Back!
                </h1>
                <p className="text-[10px] font-black tracking-wider text-muted-foreground uppercase">
                  STEP 2: SIGN IN TO {orgName.toUpperCase() || "YOUR WORKSPACE"}
                </p>
              </div>
            </div>
            {/* Selected Organization Info Pill */}
            {orgName && (
              <div className="border-[3px] border-black bg-[#D1FAE5] text-black p-4 rounded-2xl flex items-center gap-3.5 relative z-10 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]">
                <div className="p-2 border-2 border-black bg-white rounded-lg shrink-0">
                  <Building2 className="h-5 w-5 text-black" />
                </div>
                <div className="text-left">
                  <p className="text-[8px] font-black uppercase opacity-60 leading-none">Organization</p>
                  <p className="text-xs font-black uppercase text-black leading-tight tracking-tight mt-0.5">{orgName}</p>
                </div>
              </div>
            )}

            {/* Core Sign-In Action Block */}
            <div className="space-y-5">
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase text-center text-foreground tracking-wider">
                    SIGN IN WITH YOUR GOOGLE ACCOUNT
                  </p>
                  <p className="text-[9px] font-black uppercase text-center text-muted-foreground leading-relaxed tracking-wider">
                    ONE CLICK TO ACCESS YOUR WORKSPACE
                  </p>
                </div>

                {/* Exact Google Pill Button matching CONTINUE */}
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                  className="w-full py-5 rounded-full border-[3px] border-black bg-white text-black shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[5px] hover:translate-y-[5px] transition-all disabled:opacity-50 flex items-center justify-center gap-3.5 font-black uppercase text-xs tracking-wider"
                >
                  <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-labelledby="google-desc">
                    <title id="google-desc">Google Login Logo</title>
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  {loading ? "Signing in..." : "SIGN IN WITH GOOGLE"}
                </button>
              </div>

              <div className="space-y-2 text-center">
                <p className="text-[10px] font-black uppercase text-foreground tracking-wider">
                  If joining for first time Enter invite code
                </p>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="ENTER INVITE CODE..."
                  maxLength={6}
                  className="w-full px-5 py-4 border-[3px] border-black bg-white dark:bg-zinc-900 text-black dark:text-white rounded-full text-center font-black uppercase text-xs tracking-widest shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              {error && (
                <div className="px-5 py-3 text-[10px] font-black uppercase border-[3px] border-black bg-rose-500 text-white rounded-full text-center shadow-[5px_5px_0px_0px_rgba(0,0,0,1)]">
                  ⚠ {error.toUpperCase()}
                </div>
              )}
            </div>
          </div>

          {/* Secure Footer Flag */}
          <div className="pt-4 border-t border-foreground/10 flex justify-between items-center text-[8px] font-black uppercase text-muted-foreground/60 select-none">
            <span>🛡️ Luman SSL Auth Guard</span>
            <span>lucide tech</span>
          </div>

        </div>

      </div>

    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
