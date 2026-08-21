"use client";

import AppShell from "@/components/layouts/app-shell";
import type { Organization, OrganizationMember } from "@/types/organization";
import { isRoleTier, type RoleTier } from "@/types/role";
import { Check, Copy, KeyRound, Share2, UserPlus, Users } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { toast } from "sonner";

type MemberWithDetails = OrganizationMember & {
  full_name?: string;
  email?: string;
};

type Role = {
  id: string;
  organization_id: string;
  role_name: string;
  hierarchy_level: number;
};

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center uppercase font-bold">Loading Admin Dashboard...</div>}>
      <AdminDashboardContent />
    </Suspense>
  );
}

function AdminDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgSlug = searchParams.get("org");

  const [members, setMembers] = useState<MemberWithDetails[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserRole, setCurrentUserRole] = useState<RoleTier | string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"members" | "roles">("members");
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const currentOrg = organizations.find((o) => o.slug === orgSlug) || organizations[0];
  const isCustomHierarchy = currentOrg?.hierarchy_type === "custom";

  // Founder is the top hierarchy tier (ROLE_HIERARCHY_LEVEL.founder === 1 in
  // types/role.ts) and is the only tier allowed to mutate role definitions
  // below. Checked against the shared RoleTier constant instead of a bare
  // string literal, consistent with canAccessAdmin() below.
  const isFounder = currentUserRole === ("founder" satisfies RoleTier);

  // Helper to fetch session and verify access
  useEffect(() => {
    async function init() {
      try {
        const sessionRes = await fetch(`/api/auth/session${orgSlug ? `?org=${orgSlug}` : ""}`);
        const sessionData = await sessionRes.json();
        const user = sessionData.user;

        if (!user || !canAccessAdmin(user.role)) {
          alert("Access Denied: You must be a Founder or Admin.");
          router.push("/dashboard");
          return;
        }

        setCurrentUserRole(user.role);
        setOrganizations(user.organizations || []);

        const targetOrg = (user.organizations as any[]).find((o) => o.slug === orgSlug) || user.organizations[0];
        if (targetOrg) {
          setOrgId(targetOrg.id);
          await Promise.all([
            fetchMembers(targetOrg.id),
            fetchRoles(targetOrg.id)
          ]);
        }
      } catch (err) {
        console.error("Admin init error:", err);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [orgSlug, router]);

  function canAccessAdmin(role: string | undefined): boolean {
    if (!role || !isRoleTier(role)) return false;
    return role === "founder" || role === "admin";
  }

  async function fetchMembers(targetOrgId: string) {
    try {
      const res = await fetch(`/api/organization/members?orgId=${targetOrgId}`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data);
      }
    } catch (err) {
      console.error("Failed to fetch members:", err);
    }
  }

  async function fetchRoles(targetOrgId: string) {
    try {
      const res = await fetch(`/api/organization/${targetOrgId}/roles`);
      if (res.ok) {
        const data = await res.json();
        setRoles(data || []);
      }
    } catch (err) {
      console.error("Failed to fetch roles:", err);
    }
  }

  async function updateMemberAssignedRole(userId: string, assignedRoleId: string) {
    if (!orgId) return;

    try {
      const res = await fetch("/api/organization/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId, userId, assignedRoleId }),
      });

      if (res.ok) {
        const updated = await res.json();
        setMembers((prev) =>
          prev.map((m) =>
            m.user_id === userId
              ? { ...m, assigned_role_id: assignedRoleId, role: updated.role }
              : m
          )
        );
        alert("Member role updated successfully");
      } else {
        const error = await res.json();
        alert(`Failed to update member role: ${error.error}`);
      }
    } catch (err) {
      console.error("Update role error:", err);
      alert("Failed to update role");
    }
  }

  async function handleCreateRole(roleName: string) {
    if (!orgId) return;

    const nextLevel = roles.length + 1;
    try {
      const res = await fetch(`/api/organization/${orgId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role_name: roleName, hierarchy_level: nextLevel }),
      });

      if (res.ok) {
        const newRole = await res.json();
        setRoles((prev) => [...prev, newRole].sort((a, b) => a.hierarchy_level - b.hierarchy_level));
        alert("Role created successfully");
      } else {
        const err = await res.json();
        alert(`Failed to create role: ${err.error}`);
      }
    } catch (e) {
      alert("Error creating role");
    }
  }

  async function handleUpdateRole(roleId: string, roleName: string, hierarchyLevel: number) {
    if (!orgId) return;

    try {
      const res = await fetch(`/api/organization/${orgId}/roles`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId, role_name: roleName, hierarchy_level: hierarchyLevel }),
      });

      if (res.ok) {
        const updated = await res.json();
        setRoles((prev) => prev.map((r) => (r.id === roleId ? updated : r)));
        alert("Role updated successfully");
      } else {
        const err = await res.json();
        alert(`Failed to update role: ${err.error}`);
      }
    } catch (e) {
      alert("Error updating role");
    }
  }

  async function handleDeleteRole(roleId: string) {
    if (!orgId) return;

    if (!confirm("Are you sure you want to delete this role? This cannot be undone.")) return;

    try {
      const res = await fetch(`/api/organization/${orgId}/roles/${roleId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setRoles((prev) => prev.filter((r) => r.id !== roleId).map((r, idx) => ({ ...r, hierarchy_level: idx + 1 })));
        alert("Role deleted successfully");
        // Re-fetch roles to align levels in DB
        await fetchRoles(orgId);
      } else {
        const err = await res.json();
        alert(`Failed to delete role: ${err.error}`);
      }
    } catch (e) {
      alert("Error deleting role");
    }
  }

  async function handleMoveRole(fromIndex: number, toIndex: number) {
    if (!orgId || fromIndex < 0 || toIndex < 0 || fromIndex >= roles.length || toIndex >= roles.length) return;

    const reorderedRoles = [...roles];
    // Swap elements
    const temp = reorderedRoles[fromIndex];
    reorderedRoles[fromIndex] = reorderedRoles[toIndex];
    reorderedRoles[toIndex] = temp;

    // Re-assign levels
    const updatedWithLevels = reorderedRoles.map((r, idx) => ({
      id: r.id,
      hierarchy_level: idx + 1,
    }));

    try {
      const res = await fetch(`/api/organization/${orgId}/roles`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roles: updatedWithLevels }),
      });

      if (res.ok) {
        setRoles(reorderedRoles.map((r, idx) => ({ ...r, hierarchy_level: idx + 1 })));
      } else {
        const err = await res.json();
        alert(`Failed to reorder roles: ${err.error}`);
      }
    } catch (e) {
      alert("Error reordering roles");
    }
  }

  return (
    <AppShell>
      <div className="relative min-h-screen bg-[#FDFBF7] dark:bg-zinc-950 overflow-hidden pt-16 lg:pt-20">
        {/* Technical grid overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:40px_40px] opacity-70 pointer-events-none z-0" />

        {/* Ambient Glows */}
        <div className="pointer-events-none absolute top-12 left-1/4 h-96 w-96 rounded-full bg-[#FBBF24]/10 blur-[120px] dark:opacity-20 z-0" />
        <div className="pointer-events-none absolute bottom-24 right-1/4 h-96 w-96 rounded-full bg-emerald-500/10 blur-[120px] dark:opacity-20 z-0" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-4 pb-8 md:pt-6 md:pb-12 z-10">
          <h1 className="font-black uppercase leading-none border-l-8 border-foreground pl-6 mb-8 text-3xl sm:text-4xl">ADMIN DASHBOARD</h1>

          {/* Invitation Card */}
          {currentOrg?.invitation_code && (
            <div className="border-brutal-thick bg-card p-6 md:p-8 mb-8 shadow-brutal space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-4 border-foreground pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 border-brutal bg-[#A7F3D0] text-black">
                    <UserPlus className="h-6 w-6 stroke-[2.5]" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black uppercase tracking-tight">Invite Team Members</h2>
                    <p className="text-xs font-bold uppercase text-muted-foreground">
                      Teammates can join {currentOrg.name} using this code or direct link
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-black uppercase opacity-70">Code:</span>
                  <div className="flex items-center gap-2 bg-muted border-brutal px-4 py-2 font-mono text-lg font-black tracking-widest">
                    {currentOrg.invitation_code}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!currentOrg.invitation_code) return;
                      navigator.clipboard.writeText(currentOrg.invitation_code);
                      setCopiedCode(true);
                      toast.success("Invite code copied to clipboard!");
                      setTimeout(() => setCopiedCode(false), 2000);
                    }}
                    className="px-4 py-2 border-brutal bg-white hover:bg-stone-50 text-black font-black uppercase text-xs shadow-brutal-sm hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center gap-1.5"
                  >
                    {copiedCode ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedCode ? "COPIED" : "COPY CODE"}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-black uppercase tracking-wider text-muted-foreground">
                  Direct Shareable Join Link
                </label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    readOnly
                    value={
                      typeof window !== "undefined"
                        ? `${window.location.origin}/join?org=${currentOrg.slug}&code=${currentOrg.invitation_code}`
                        : ""
                    }
                    className="flex-1 border-brutal px-4 py-3 text-xs font-mono bg-background text-foreground font-bold truncate focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!currentOrg.slug || !currentOrg.invitation_code) return;
                      const link = `${window.location.origin}/join?org=${currentOrg.slug}&code=${currentOrg.invitation_code}`;
                      navigator.clipboard.writeText(link);
                      setCopiedLink(true);
                      toast.success("1-Click Invite Link copied to clipboard!", {
                        description: "Teammates can click this link to auto-fill their invitation and join.",
                      });
                      setTimeout(() => setCopiedLink(false), 2000);
                    }}
                    className="px-6 py-3 border-brutal bg-[#FBBF24] hover:bg-[#FACC15] text-black font-black uppercase text-xs shadow-brutal hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all shrink-0 flex items-center justify-center gap-2"
                  >
                    {copiedLink ? <Check className="h-4 w-4 stroke-[3]" /> : <Share2 className="h-4 w-4" />}
                    {copiedLink ? "LINK COPIED!" : "COPY SHAREABLE LINK"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tab selector */}
          <div className="flex gap-4 mb-8">
            <button
              onClick={() => setActiveTab("members")}
              className={`px-6 py-3 font-black uppercase border-brutal transition-all ${
                activeTab === "members" ? "bg-accent text-accent-foreground shadow-brutal-sm" : "bg-card hover:bg-stone-50"
              }`}
            >
              Members
            </button>
            <button
              onClick={() => setActiveTab("roles")}
              className={`px-6 py-3 font-black uppercase border-brutal transition-all ${
                activeTab === "roles" ? "bg-accent text-accent-foreground shadow-brutal-sm" : "bg-card hover:bg-stone-50"
              }`}
            >
              Roles & Hierarchy
            </button>
          </div>

          {loading ? (
            <div className="text-lg font-bold uppercase animate-pulse">LOADING DETAILS...</div>
          ) : (
            <div className="space-y-8">
              {activeTab === "members" && (
                <div className="border-brutal-thick bg-card p-8">
                  <h2 className="text-2xl font-black uppercase mb-6">TEAM MEMBERS</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left font-bold">
                      <thead>
                        <tr className="border-b-4 border-foreground">
                          <th className="py-4 font-black uppercase">Member</th>
                          <th className="py-4 font-black uppercase">Email</th>
                          <th className="py-4 font-black uppercase">Role Name</th>
                          <th className="py-4 font-black uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((member) => {
                          const roleObj = roles.find((r) => r.id === member.assigned_role_id);
                          return (
                            <tr key={member.id} className="border-b-2 border-muted">
                              <td className="py-4 font-bold uppercase">{member.full_name || "Unknown"}</td>
                              <td className="py-4 font-mono text-sm opacity-70">{member.email || "Unknown"}</td>
                              <td className="py-4">
                                <span
                                  className={`px-3 py-1 font-bold uppercase text-xs border-brutal inline-block ${
                                    member.role === "founder" ? "bg-accent text-accent-foreground" : "bg-muted"
                                  }`}
                                >
                                  {roleObj ? roleObj.role_name : member.role}
                                </span>
                              </td>
                              <td className="py-4">
                                {isFounder ||
                                (currentUserRole === "admin" && member.role === "intern") ? (
                                  <select
                                    value={member.assigned_role_id}
                                    onChange={(e) => updateMemberAssignedRole(member.user_id, e.target.value)}
                                    className="border-2 border-foreground p-2 font-bold uppercase text-sm"
                                  >
                                    {roles.map((r) => (
                                      <option key={r.id} value={r.id}>
                                        {r.role_name} (Level {r.hierarchy_level})
                                      </option>
                                    ))}
                                  </select>
                                ) : (
                                  <span className="text-xs text-muted-foreground uppercase font-bold">LOCKED</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === "roles" && (
                <div className="border-brutal-thick bg-card p-8 space-y-6">
                  {!isCustomHierarchy ? (
                    <div className="border-brutal bg-[#FED7AA] p-6 text-sm font-bold uppercase text-black">
                      This organization is using a Fixed Hierarchy. Custom role configurations are not available for fixed hierarchies.
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-center flex-wrap gap-4 border-b-4 border-foreground pb-4">
                        <h2 className="text-2xl font-black uppercase">ORGANIZATION ROLES</h2>
                        {isFounder && (
                          <button
                            onClick={() => {
                              const name = prompt("Enter new role name:");
                              if (name) handleCreateRole(name);
                            }}
                            className="px-6 py-3 border-brutal shadow-brutal hover-brutal bg-[#A7F3D0] text-black font-black uppercase text-sm"
                          >
                            + Add Custom Role
                          </button>
                        )}
                      </div>

                      <div className="space-y-4">
                        {roles.map((role, idx) => (
                          <div key={role.id} className="flex flex-wrap items-center justify-between border-brutal bg-background p-4 shadow-brutal-sm gap-4">
                            <div className="flex items-center gap-4">
                              <span className="px-3 py-1 font-black bg-black text-white text-xs uppercase">LEVEL {role.hierarchy_level}</span>
                              <span className="font-bold uppercase text-lg">{role.role_name}</span>
                            </div>

                            {isFounder && (
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newName = prompt("Edit role name:", role.role_name);
                                    if (newName) handleUpdateRole(role.id, newName, role.hierarchy_level);
                                  }}
                                  className="px-3 py-1 border-2 border-black font-black text-xs uppercase bg-white hover:bg-stone-100 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]"
                                >
                                  Rename
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() => handleMoveRole(idx, idx - 1)}
                                  className="px-3 py-1 border-2 border-black font-black text-xs uppercase bg-white hover:bg-stone-100 disabled:opacity-30 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]"
                                >
                                  &uarr; Move Up
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === roles.length - 1}
                                  onClick={() => handleMoveRole(idx, idx + 1)}
                                  className="px-3 py-1 border-2 border-black font-black text-xs uppercase bg-white hover:bg-stone-100 disabled:opacity-30 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px]"
                                >
                                  &darr; Move Down
                                </button>
                                <button
                                  type="button"
                                  disabled={role.hierarchy_level === 1}
                                  onClick={() => handleDeleteRole(role.id)}
                                  className="px-3 py-1 border-brutal bg-destructive text-destructive-foreground font-black text-xs uppercase hover:opacity-90 disabled:opacity-30"
                                >
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
