"use client";

import { ArrowRight, GripVertical, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ErrorPill,
  FieldHint,
  FieldLabel,
  PillButton,
  PillInput,
  StepRail,
} from "@/components/auth/auth-controls";
import { AuthShell } from "@/components/auth/auth-shell";

type CustomRole = { id: string; role_name: string; hierarchy_level: number };

const newRoleId = () => Math.random().toString(36).slice(2, 9);

const DEFAULT_ROLES: CustomRole[] = ["Founder", "Director", "Manager", "Employee", "Intern"].map(
  (role_name, i) => ({ id: newRoleId(), role_name, hierarchy_level: i + 1 })
);

/** Re-stamp hierarchy_level so it always matches list order, top = 1. */
function renumber(roles: CustomRole[]): CustomRole[] {
  return roles.map((role, i) => ({ ...role, hierarchy_level: i + 1 }));
}

export default function OrgRegisterPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [hierarchyType, setHierarchyType] = useState<"fixed" | "custom">("fixed");
  const [customRoles, setCustomRoles] = useState<CustomRole[]>(DEFAULT_ROLES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function moveRole(from: number, to: number) {
    if (to < 0 || to >= customRoles.length) return;
    const next = [...customRoles];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setCustomRoles(renumber(next));
  }

  function removeRole(index: number) {
    if (customRoles.length <= 1) return;
    setCustomRoles(renumber(customRoles.filter((_, i) => i !== index)));
  }

  function renameRole(index: number, value: string) {
    const next = [...customRoles];
    next[index] = { ...next[index], role_name: value };
    setCustomRoles(next);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: orgName,
          hierarchyType,
          customRoles:
            hierarchyType === "custom"
              ? customRoles.map(({ role_name, hierarchy_level }) => ({ role_name, hierarchy_level }))
              : undefined,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        // Store organization info
        sessionStorage.setItem("selected_org_slug", data.slug);
        sessionStorage.setItem("selected_org_name", data.name);
        sessionStorage.setItem("new_org_id", data.id);

        // Redirect based on login status
        if (data.loggedIn) {
          router.push(`/dashboard?org=${data.slug}`);
        } else {
          router.push(`/register?org=${data.slug}&new=true`);
        }
      } else {
        setError(data.error || "Failed to create organization");
        setLoading(false);
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="New Workspace Setup"
      title="Name Your Workspace"
      subtitle="Step 1: Create your organization"
      backHref="/"
      backLabel="Back Home"
      wide={hierarchyType === "custom"}
      footer={
        <div className="space-y-3.5 text-center">
          <p className="text-[10px] font-black uppercase text-muted-foreground tracking-wider">
            Already have a team workspace?
          </p>
          <Link
            href="/org-login"
            className="inline-flex w-full py-5 rounded-full border-[3px] border-black bg-black hover:bg-zinc-900 text-white text-center shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] dark:shadow-[5px_5px_0px_0px_rgba(255,255,255,1)] hover:shadow-none hover:translate-x-[5px] hover:translate-y-[5px] transition-all justify-center items-center font-black uppercase text-xs tracking-wider"
          >
            Sign In To Workspace
          </Link>
        </div>
      }
    >
      <div className="space-y-6">
        <StepRail step={1} labels={["Create organization", "Create founder account"]} />

        <form onSubmit={handleCreate} className="space-y-6">
          {/* Organization name */}
          <div className="space-y-2">
            <FieldLabel htmlFor="orgName">Organization Name</FieldLabel>
            <PillInput
              id="orgName"
              tone="pink"
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="ENTER ORGANIZATION NAME"
              required
              minLength={3}
              autoFocus
            />
            <FieldHint>This becomes your workspace display name and sign-in slug.</FieldHint>
          </div>

          {/* Hierarchy type */}
          <div className="space-y-2.5">
            <FieldLabel>Role Structure</FieldLabel>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setHierarchyType("fixed")}
                aria-pressed={hierarchyType === "fixed"}
                className={`p-4 rounded-2xl border-[3px] border-black text-left transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent ${
                  hierarchyType === "fixed"
                    ? "bg-[#FBBF24] text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                    : "bg-transparent text-foreground hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                }`}
              >
                <p className="text-[11px] font-black uppercase tracking-tight leading-tight">Standard</p>
                <p className="text-[9px] font-black uppercase opacity-70 mt-1.5 leading-snug">
                  Founder, admin, intern
                </p>
              </button>

              <button
                type="button"
                onClick={() => setHierarchyType("custom")}
                aria-pressed={hierarchyType === "custom"}
                className={`p-4 rounded-2xl border-[3px] border-black text-left transition-all focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent ${
                  hierarchyType === "custom"
                    ? "bg-[#FBBF24] text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
                    : "bg-transparent text-foreground hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                }`}
              >
                <p className="text-[11px] font-black uppercase tracking-tight leading-tight">Custom</p>
                <p className="text-[9px] font-black uppercase opacity-70 mt-1.5 leading-snug">
                  Define your own ladder
                </p>
              </button>
            </div>
          </div>

          {/* Custom role builder */}
          {hierarchyType === "custom" && (
            <div className="border-[3px] border-black rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground leading-tight">
                  Highest rank first
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setCustomRoles(
                      renumber([...customRoles, { id: newRoleId(), role_name: "", hierarchy_level: customRoles.length + 1 }])
                    )
                  }
                  className="px-3 py-1.5 rounded-full border-2 border-black bg-[#D1FAE5] text-black text-[9px] font-black uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all flex items-center gap-1 shrink-0"
                >
                  <Plus className="h-3 w-3 stroke-[3]" />
                  Add
                </button>
              </div>

              <ul className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {customRoles.map((role, idx) => (
                  <li
                    key={role.id}
                    className="flex items-center gap-2 bg-[#FDFBF7] dark:bg-zinc-800 border-2 border-black rounded-xl px-2.5 py-2"
                  >
                    <span className="flex items-center gap-1 shrink-0">
                      <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50" />
                      <span className="w-5 h-5 flex items-center justify-center rounded-md bg-black text-white text-[9px] font-black">
                        {role.hierarchy_level}
                      </span>
                    </span>

                    <input
                      type="text"
                      value={role.role_name}
                      onChange={(e) => renameRole(idx, e.target.value)}
                      className="flex-1 min-w-0 bg-transparent border-none text-[10px] font-black uppercase tracking-wide text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
                      placeholder="ROLE NAME"
                      aria-label={`Role ${role.hierarchy_level} name`}
                      required
                    />

                    <span className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveRole(idx, idx - 1)}
                        aria-label={`Move ${role.role_name || "role"} up`}
                        className="w-6 h-6 rounded-md border-2 border-black bg-white dark:bg-zinc-700 text-black dark:text-white text-[9px] font-black disabled:opacity-25 disabled:cursor-not-allowed hover:bg-[#FBBF24] transition-colors"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={idx === customRoles.length - 1}
                        onClick={() => moveRole(idx, idx + 1)}
                        aria-label={`Move ${role.role_name || "role"} down`}
                        className="w-6 h-6 rounded-md border-2 border-black bg-white dark:bg-zinc-700 text-black dark:text-white text-[9px] font-black disabled:opacity-25 disabled:cursor-not-allowed hover:bg-[#FBBF24] transition-colors"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        disabled={customRoles.length <= 1}
                        onClick={() => removeRole(idx)}
                        aria-label={`Remove ${role.role_name || "role"}`}
                        className="w-6 h-6 rounded-md border-2 border-black bg-rose-500 text-white flex items-center justify-center disabled:opacity-25 disabled:cursor-not-allowed hover:bg-rose-600 transition-colors"
                      >
                        <X className="h-3 w-3 stroke-[3]" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && <ErrorPill>{error.toUpperCase()}</ErrorPill>}

          <PillButton type="submit" tone="gold" disabled={loading}>
            {loading ? "Creating..." : "Create Organization"}
            <ArrowRight className="h-4 w-4 stroke-[3]" />
          </PillButton>
        </form>
      </div>
    </AuthShell>
  );
}
