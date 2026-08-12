"use client";

import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  KeyRound,
  Loader2,
  Plus,
  Sparkle,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Step =
  | "welcome"
  | "path"
  | "create-team"
  | "hierarchy"
  | "join-team"
  | "join-invite"
  | "signin"
  | "workspace"
  | "done";

type SessionUser = {
  ownerName: string;
};

type CustomRole = { role_name: string; hierarchy_level: number };

const GoogleG = () => (
  <svg className="size-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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
);

/**
 * Desktop-only account entry: org/team selection happens BEFORE Google
 * sign-in, mirroring the web flow (org-login/org-register -> login/register
 * -> Google), rather than signing in first and asking about teams after.
 * Org is resolved/created pre-auth so the OAuth redirect can carry it as
 * ?org=slug (and ?new=true for brand-new orgs), letting /auth/callback
 * assign founder/intern correctly the moment the session is created.
 */
export function DesktopOnboarding({
  user,
  initialOrgSlug,
  isAuthenticated,
}: {
  user: SessionUser | null;
  initialOrgSlug?: string;
  isAuthenticated: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(
    isAuthenticated && initialOrgSlug ? "workspace" : "welcome",
  );
  const [orgSlug, setOrgSlug] = useState(initialOrgSlug ?? "");
  const [orgName, setOrgName] = useState("");
  const [isNewOrg, setIsNewOrg] = useState(false);
  const [hierarchyType, setHierarchyType] = useState<"fixed" | "custom">("fixed");
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([
    { role_name: "Founder", hierarchy_level: 1 },
    { role_name: "Admin", hierarchy_level: 2 },
    { role_name: "Intern", hierarchy_level: 3 },
  ]);
  const [workspaceSlugInput, setWorkspaceSlugInput] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleContinueFromName(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (orgName.trim().length < 3) {
      setError("Team name needs at least 3 characters");
      return;
    }
    setStep("hierarchy");
  }

  async function handleCreateTeamThenSignIn() {
    setError("");
    if (hierarchyType === "custom" && customRoles.some((r) => !r.role_name.trim())) {
      setError("Every role needs a name");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: orgName.trim(),
          hierarchyType,
          customRoles: hierarchyType === "custom" ? customRoles : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't create the team");
        return;
      }
      setOrgSlug(data.slug);
      setIsNewOrg(true);
      setStep("signin");
    } catch {
      setError("Couldn't reach Luman. Check your connection and try again");
    } finally {
      setLoading(false);
    }
  }

  async function handleFindTeam(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const slug = workspaceSlugInput
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    if (!slug) {
      setError("Enter your team's workspace name");
      return;
    }
    setLoading(true);
    try {
      const configRes = await fetch("/api/config");
      const { siteUrl } = await configRes.json();
      const res = await fetch(`${siteUrl}/api/auth/org/${slug}`);
      const data = await res.json();
      if (!res.ok || !data.exists) {
        setError("Team not found. Check the name and try again");
        return;
      }
      setOrgSlug(data.slug);
      setIsNewOrg(false);
      setStep("join-invite");
    } catch {
      setError("Couldn't reach Luman. Check your connection and try again");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyInvite(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (inviteCode.trim().length !== 6) {
      setError("Invite codes are 6 characters");
      return;
    }
    setLoading(true);
    try {
      const configRes = await fetch("/api/config");
      const { siteUrl } = await configRes.json();
      // Called against the deployed origin (not the local embedded server)
      // purely to check the code before showing the sign-in step — no
      // session exists yet to attach cookies to, and a cross-origin
      // credentialed request from an arbitrary localhost port can't work
      // anyway. The code is re-verified and the membership actually
      // granted after sign-in, once a session exists — see handleSignIn,
      // which carries it through the OAuth redirect to /auth/callback.
      const res = await fetch(`${siteUrl}/api/auth/verify-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgSlug, code: inviteCode.trim().toUpperCase() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "That invite code didn't match this team");
        return;
      }
      setStep("signin");
    } catch {
      setError("Couldn't reach Luman. Check your connection and try again");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignIn() {
    setError("");
    setLoading(true);
    try {
      const configRes = await fetch("/api/config");
      const { siteUrl } = await configRes.json();
      if (!siteUrl) {
        setError("Desktop sign-in isn't configured. Missing site URL");
        setLoading(false);
        return;
      }
      const loginUrl = new URL(`${siteUrl}/auth/desktop-login`);
      if (orgSlug) loginUrl.searchParams.set("org", orgSlug);
      if (isNewOrg) loginUrl.searchParams.set("new", "true");
      // Re-verified and actually granted in /auth/callback once a session
      // exists — the pre-auth check above only validated the code, it
      // couldn't persist a cross-origin pending-join cookie from here.
      if (!isNewOrg && inviteCode.trim()) {
        loginUrl.searchParams.set("invite", inviteCode.trim().toUpperCase());
      }

      if (window.electronAPI?.isDesktop) {
        await window.electronAPI.shell.openExternal(loginUrl.toString());
      } else {
        window.location.href = loginUrl.toString();
      }
    } catch {
      setError("Couldn't reach Luman. Check your connection and try again");
      setLoading(false);
    }
  }

  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!workspaceName.trim()) {
      setError("Give your workspace a name");
      return;
    }
    setLoading(true);
    try {
      const sessionRes = await fetch(`/api/auth/session?org=${orgSlug}`);
      const sessionData = await sessionRes.json();
      const currentOrg = sessionData.user?.organizations?.find(
        (o: { slug: string }) => o.slug === orgSlug,
      );
      if (!currentOrg) {
        setError("Couldn't confirm your team membership. Try again");
        return;
      }

      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerName: workspaceName.trim(),
          role: "intern",
          ownerId: currentOrg.id,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Couldn't create the workspace");
        return;
      }
      setStep("done");
      setTimeout(() => router.push(`/dashboard?org=${orgSlug}`), 900);
    } catch {
      setError("Couldn't reach Luman. Check your connection and try again");
    } finally {
      setLoading(false);
    }
  }

  const firstName = user?.ownerName.split(" ")[0];

  return (
    <div className="relative flex h-full min-h-[calc(100vh-2rem)] w-full items-center justify-center overflow-hidden bg-[#FDFBF7] px-6 py-10 dark:bg-zinc-950">
      <div className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(to_right,#e5e2db_1px,transparent_1px),linear-gradient(to_bottom,#e5e2db_1px,transparent_1px)] bg-[size:40px_40px] opacity-60 dark:opacity-5 dark:bg-[linear-gradient(to_right,#ffffff_1px,transparent_1px),linear-gradient(to_bottom,#ffffff_1px,transparent_1px)]" />
      <div className="pointer-events-none absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-yellow-200/20 blur-[100px] dark:bg-yellow-500/5" />
      <div className="pointer-events-none absolute bottom-1/4 right-1/4 h-96 w-96 rounded-full bg-emerald-200/20 blur-[100px] dark:bg-emerald-500/5" />

      <div className="relative z-10 w-full max-w-[480px]">
        <OnboardingProgress step={step} />

        <div className="mt-8 rounded-[36px] border-[4px] border-black bg-[#FDFBF7] p-8 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] dark:border-stone-100 dark:bg-zinc-900 dark:shadow-[12px_12px_0px_0px_rgba(255,255,255,1)] sm:p-10">
          {step === "welcome" && <WelcomeStep onNext={() => setStep("path")} />}

          {step === "path" && (
            <PathStep
              onCreate={() => setStep("create-team")}
              onJoin={() => setStep("join-team")}
              onBack={() => setStep("welcome")}
            />
          )}

          {step === "create-team" && (
            <CreateTeamStep
              orgName={orgName}
              setOrgName={setOrgName}
              error={error}
              onBack={() => {
                setError("");
                setStep("path");
              }}
              onSubmit={handleContinueFromName}
            />
          )}

          {step === "hierarchy" && (
            <HierarchyStep
              hierarchyType={hierarchyType}
              setHierarchyType={setHierarchyType}
              customRoles={customRoles}
              setCustomRoles={setCustomRoles}
              loading={loading}
              error={error}
              onBack={() => {
                setError("");
                setStep("create-team");
              }}
              onSubmit={handleCreateTeamThenSignIn}
            />
          )}

          {step === "join-team" && (
            <FindTeamStep
              workspaceSlugInput={workspaceSlugInput}
              setWorkspaceSlugInput={setWorkspaceSlugInput}
              loading={loading}
              error={error}
              onBack={() => {
                setError("");
                setStep("path");
              }}
              onSubmit={handleFindTeam}
            />
          )}

          {step === "join-invite" && (
            <JoinInviteStep
              inviteCode={inviteCode}
              setInviteCode={setInviteCode}
              loading={loading}
              error={error}
              onBack={() => {
                setError("");
                setStep("join-team");
              }}
              onSubmit={handleVerifyInvite}
            />
          )}

          {step === "signin" && (
            <SignInStep loading={loading} error={error} onSignIn={handleSignIn} />
          )}

          {step === "workspace" && (
            <WorkspaceStep
              firstName={firstName}
              workspaceName={workspaceName}
              setWorkspaceName={setWorkspaceName}
              loading={loading}
              error={error}
              onSubmit={handleCreateWorkspace}
            />
          )}

          {step === "done" && <DoneStep />}
        </div>
      </div>
    </div>
  );
}

function OnboardingProgress({ step }: { step: Step }) {
  const order: Step[] = ["welcome", "path", "signin", "workspace", "done"];
  const pathSteps: Step[] = ["create-team", "hierarchy", "join-team", "join-invite"];
  const normalized = pathSteps.includes(step) ? "path" : step;
  const currentIndex = order.indexOf(normalized);

  return (
    <div className="flex items-center justify-center gap-2">
      {order.map((s, i) => (
        <div
          key={s}
          className={cn(
            "h-2 rounded-full border-2 border-black transition-all duration-300 dark:border-stone-100",
            i <= currentIndex ? "w-10 bg-accent" : "w-5 bg-transparent",
          )}
        />
      ))}
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-black bg-accent px-4 py-1.5 text-[10px] font-black uppercase tracking-wider text-accent-foreground shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]">
        <Sparkle className="size-3.5 animate-pulse" />
        Luman Workspace Gateway
      </div>

      <div className="mt-6 rounded-2xl border-2 border-black bg-foreground p-3 text-background dark:border-stone-100">
        <Sparkles className="size-6" strokeWidth={2} />
      </div>

      <h1 className="mt-6 text-3xl font-black uppercase leading-none tracking-tight text-foreground">
        Welcome to Luman
      </h1>
      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Let's get your team set up on Luman Desktop. It takes less than a minute.
      </p>

      <button
        type="button"
        onClick={onNext}
        className="mt-9 flex w-full items-center justify-center gap-2 rounded-full border-[3px] border-black bg-accent py-5 text-xs font-black uppercase tracking-wider text-accent-foreground shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[5px] hover:translate-y-[5px] hover:shadow-none dark:border-stone-100"
      >
        Get started
        <ArrowRight className="size-4" strokeWidth={2.5} />
      </button>
    </div>
  );
}

function PathStep({
  onCreate,
  onJoin,
  onBack,
}: {
  onCreate: () => void;
  onJoin: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <BackButton onClick={onBack} />
      <h2 className="text-2xl font-black uppercase leading-none tracking-tight text-foreground">
        Set up your team
      </h2>
      <p className="mt-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Start a new team, or sign in to one you already belong to
      </p>

      <div className="mt-7 flex flex-col gap-4">
        <button
          type="button"
          onClick={onCreate}
          className="group flex items-center gap-4 rounded-2xl border-[3px] border-black bg-[#D1FAE5] p-5 text-left text-black shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
        >
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-black bg-white">
            <Building2 className="size-5" strokeWidth={2.25} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-black uppercase tracking-tight">Create a new team</p>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide opacity-70">
              You're the first one here
            </p>
          </div>
          <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </button>

        <button
          type="button"
          onClick={onJoin}
          className="group flex items-center gap-4 rounded-2xl border-[3px] border-black bg-[#FBBF24] p-5 text-left text-black shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[3px] hover:translate-y-[3px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
        >
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-black bg-white">
            <Users className="size-5" strokeWidth={2.25} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-black uppercase tracking-tight">Join an existing team</p>
            <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide opacity-70">
              Enter your team's workspace name
            </p>
          </div>
          <ArrowRight className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
    </div>
  );
}

function CreateTeamStep({
  orgName,
  setOrgName,
  error,
  onBack,
  onSubmit,
}: {
  orgName: string;
  setOrgName: (v: string) => void;
  error: string;
  onBack: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <div>
      <BackButton onClick={onBack} />
      <h2 className="text-2xl font-black uppercase leading-none tracking-tight text-foreground">
        Name your team
      </h2>
      <p className="mt-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        This is what your teammates will see when they join
      </p>

      <form onSubmit={onSubmit} className="mt-7 space-y-4">
        <input
          autoFocus
          type="text"
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          placeholder="NORTHWIND STUDIO"
          className="w-full rounded-full border-[3px] border-black bg-white px-6 py-4 text-center text-xs font-black uppercase tracking-widest text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] outline-none placeholder:text-black/30 focus:ring-2 focus:ring-accent dark:bg-zinc-900 dark:text-white dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]"
        />
        {error && <ErrorText message={error} />}
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-full border-[3px] border-black bg-foreground py-5 text-xs font-black uppercase tracking-wider text-background shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[5px] hover:translate-y-[5px] hover:shadow-none dark:border-stone-100"
        >
          Continue
          <ArrowRight className="size-4" strokeWidth={2.5} />
        </button>
      </form>
    </div>
  );
}

function HierarchyStep({
  hierarchyType,
  setHierarchyType,
  customRoles,
  setCustomRoles,
  loading,
  error,
  onBack,
  onSubmit,
}: {
  hierarchyType: "fixed" | "custom";
  setHierarchyType: (v: "fixed" | "custom") => void;
  customRoles: CustomRole[];
  setCustomRoles: (v: CustomRole[]) => void;
  loading: boolean;
  error: string;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <div>
      <BackButton onClick={onBack} />
      <h2 className="text-2xl font-black uppercase leading-none tracking-tight text-foreground">
        Choose your hierarchy
      </h2>
      <p className="mt-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        How roles work across your team
      </p>

      <div className="mt-7 grid grid-cols-1 gap-3">
        <button
          type="button"
          onClick={() => setHierarchyType("fixed")}
          className={cn(
            "rounded-2xl border-[3px] border-black p-4 text-left transition-all",
            hierarchyType === "fixed"
              ? "bg-accent text-accent-foreground shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
              : "bg-white text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:bg-zinc-900 dark:text-white dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,1)]",
          )}
        >
          <p className="text-sm font-black uppercase tracking-tight">Fixed hierarchy</p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide opacity-70">
            Founder, Admin, Intern roles — the default
          </p>
        </button>
        <button
          type="button"
          onClick={() => setHierarchyType("custom")}
          className={cn(
            "rounded-2xl border-[3px] border-black p-4 text-left transition-all",
            hierarchyType === "custom"
              ? "bg-accent text-accent-foreground shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
              : "bg-white text-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] dark:bg-zinc-900 dark:text-white dark:shadow-[3px_3px_0px_0px_rgba(255,255,255,1)]",
          )}
        >
          <p className="text-sm font-black uppercase tracking-tight">Custom hierarchy</p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide opacity-70">
            Define your own roles and levels
          </p>
        </button>
      </div>

      {hierarchyType === "custom" && (
        <div className="mt-4 space-y-3 rounded-2xl border-[3px] border-black bg-muted p-4 dark:border-stone-100">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider">
              Roles, highest to lowest
            </span>
            <button
              type="button"
              onClick={() =>
                setCustomRoles([
                  ...customRoles,
                  { role_name: "", hierarchy_level: customRoles.length + 1 },
                ])
              }
              className="flex items-center gap-1 rounded-full border-2 border-black bg-white px-3 py-1.5 text-[9px] font-black uppercase tracking-wider dark:bg-zinc-900 dark:text-white"
            >
              <Plus className="size-3" strokeWidth={2.5} />
              Add
            </button>
          </div>

          <div className="space-y-2">
            {customRoles.map((role, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 rounded-full border-2 border-black bg-white px-3 py-2 dark:bg-zinc-900"
              >
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-black text-[9px] font-black text-white">
                  {role.hierarchy_level}
                </span>
                <input
                  type="text"
                  value={role.role_name}
                  onChange={(e) => {
                    const updated = [...customRoles];
                    updated[idx] = { ...updated[idx], role_name: e.target.value };
                    setCustomRoles(updated);
                  }}
                  placeholder="ROLE NAME"
                  className="flex-1 bg-transparent text-xs font-black uppercase tracking-wide text-black outline-none dark:text-white"
                />
                <button
                  type="button"
                  disabled={customRoles.length <= 1}
                  onClick={() =>
                    setCustomRoles(
                      customRoles
                        .filter((_, i) => i !== idx)
                        .map((r, i) => ({ ...r, hierarchy_level: i + 1 })),
                    )
                  }
                  className="shrink-0 text-muted-foreground disabled:opacity-30"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5">
        {error && <ErrorText message={error} />}
        <div className="mt-4">
          <SubmitButton loading={loading} label="Create team" onClick={onSubmit} />
        </div>
      </div>
    </div>
  );
}

function FindTeamStep({
  workspaceSlugInput,
  setWorkspaceSlugInput,
  loading,
  error,
  onBack,
  onSubmit,
}: {
  workspaceSlugInput: string;
  setWorkspaceSlugInput: (v: string) => void;
  loading: boolean;
  error: string;
  onBack: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <div>
      <BackButton onClick={onBack} />
      <h2 className="text-2xl font-black uppercase leading-none tracking-tight text-foreground">
        Find your team
      </h2>
      <p className="mt-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Enter the workspace name your administrator gave you
      </p>

      <form onSubmit={onSubmit} className="mt-7 space-y-4">
        <input
          autoFocus
          type="text"
          value={workspaceSlugInput}
          onChange={(e) => setWorkspaceSlugInput(e.target.value)}
          placeholder="NORTHWIND STUDIO"
          className="w-full rounded-full border-[3px] border-black bg-white px-6 py-4 text-center text-xs font-black uppercase tracking-widest text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] outline-none placeholder:text-black/30 focus:ring-2 focus:ring-accent dark:bg-zinc-900 dark:text-white dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]"
        />
        {error && <ErrorText message={error} />}
        <SubmitButton loading={loading} label="Continue" />
      </form>
    </div>
  );
}

function JoinInviteStep({
  inviteCode,
  setInviteCode,
  loading,
  error,
  onBack,
  onSubmit,
}: {
  inviteCode: string;
  setInviteCode: (v: string) => void;
  loading: boolean;
  error: string;
  onBack: () => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <div>
      <BackButton onClick={onBack} />
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-muted-foreground" />
        <h2 className="text-2xl font-black uppercase leading-none tracking-tight text-foreground">
          Enter your invite code
        </h2>
      </div>
      <p className="mt-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Ask a teammate for the 6-character code from their team settings
      </p>

      <form onSubmit={onSubmit} className="mt-7 space-y-4">
        <input
          autoFocus
          type="text"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value.toUpperCase().slice(0, 6))}
          placeholder="A1B2C3"
          maxLength={6}
          className="w-full rounded-full border-[3px] border-black bg-white px-6 py-5 text-center font-mono text-xl font-black tracking-[0.4em] text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] outline-none placeholder:tracking-[0.4em] placeholder:text-black/20 focus:ring-2 focus:ring-accent dark:bg-zinc-900 dark:text-white dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]"
        />
        {error && <ErrorText message={error} />}
        <SubmitButton loading={loading} label="Verify code" />
      </form>
    </div>
  );
}

function SignInStep({
  loading,
  error,
  onSignIn,
}: {
  loading: boolean;
  error: string;
  onSignIn: () => void;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-black bg-accent px-4 py-1.5 text-[10px] font-black uppercase tracking-wider text-accent-foreground shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]">
        <Check className="size-3.5" strokeWidth={2.5} />
        Team confirmed
      </div>

      <h2 className="mt-6 text-2xl font-black uppercase leading-none tracking-tight text-foreground">
        Sign in to continue
      </h2>
      <p className="mt-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        One click to access your team's workspace
      </p>

      <button
        type="button"
        onClick={onSignIn}
        disabled={loading}
        className="mt-9 flex w-full items-center justify-center gap-3.5 rounded-full border-[3px] border-black bg-white py-5 text-xs font-black uppercase tracking-wider text-black shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[5px] hover:translate-y-[5px] hover:shadow-none disabled:opacity-50 dark:bg-zinc-100"
      >
        {loading ? <Loader2 className="size-5 shrink-0 animate-spin" /> : <GoogleG />}
        {loading ? "Opening browser…" : "Continue with Google"}
      </button>

      {loading && (
        <p className="mt-5 text-[10px] font-black uppercase tracking-wider text-muted-foreground">
          Finish signing in in your browser, then come back here
        </p>
      )}

      {error && (
        <div className="mt-5 w-full">
          <ErrorText message={error} />
        </div>
      )}
    </div>
  );
}

function WorkspaceStep({
  firstName,
  workspaceName,
  setWorkspaceName,
  loading,
  error,
  onSubmit,
}: {
  firstName?: string;
  workspaceName: string;
  setWorkspaceName: (v: string) => void;
  loading: boolean;
  error: string;
  onSubmit: (e: React.FormEvent) => void;
}) {
  return (
    <div>
      <h2 className="text-2xl font-black uppercase leading-none tracking-tight text-foreground">
        {firstName ? `Welcome, ${firstName}` : "Create your first workspace"}
      </h2>
      <p className="mt-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        A workspace holds your notes, tasks, and calendar. You can add more later
      </p>

      <form onSubmit={onSubmit} className="mt-7 space-y-4">
        <input
          autoFocus
          type="text"
          value={workspaceName}
          onChange={(e) => setWorkspaceName(e.target.value)}
          placeholder="PRODUCT TEAM"
          className="w-full rounded-full border-[3px] border-black bg-white px-6 py-4 text-center text-xs font-black uppercase tracking-widest text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] outline-none placeholder:text-black/30 focus:ring-2 focus:ring-accent dark:bg-zinc-900 dark:text-white dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]"
        />
        {error && <ErrorText message={error} />}
        <SubmitButton loading={loading} label="Create workspace" />
      </form>
    </div>
  );
}

function DoneStep() {
  return (
    <div className="flex flex-col items-center py-4 text-center">
      <div className="mb-5 flex size-14 items-center justify-center rounded-full border-[3px] border-black bg-[#34D399] shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:border-stone-100">
        <Check className="size-6 text-black" strokeWidth={3} />
      </div>
      <h2 className="text-2xl font-black uppercase leading-none tracking-tight text-foreground">
        You're all set
      </h2>
      <p className="mt-2.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Opening your workspace…
      </p>
    </div>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-5 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-3.5" strokeWidth={2.5} />
      Back
    </button>
  );
}

function ErrorText({ message }: { message: string }) {
  return (
    <div className="rounded-full border-[3px] border-black bg-rose-500 px-5 py-3 text-center text-[10px] font-black uppercase tracking-wider text-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
      ⚠ {message}
    </div>
  );
}

function SubmitButton({
  loading,
  label,
  onClick,
}: {
  loading: boolean;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type={onClick ? "button" : "submit"}
      onClick={onClick}
      disabled={loading}
      className="flex w-full items-center justify-center gap-2 rounded-full border-[3px] border-black bg-foreground py-5 text-xs font-black uppercase tracking-wider text-background shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] transition-all hover:translate-x-[5px] hover:translate-y-[5px] hover:shadow-none disabled:opacity-50 dark:border-stone-100"
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : null}
      {loading ? "Please wait…" : label}
    </button>
  );
}
