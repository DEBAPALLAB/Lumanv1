"use client";

import { Building2, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function OrgRegisterPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [hierarchyType, setHierarchyType] = useState<"fixed" | "custom">("fixed");
  const [customRoles, setCustomRoles] = useState<{ role_name: string; hierarchy_level: number }[]>([
    { role_name: "Founder", hierarchy_level: 1 },
    { role_name: "Director", hierarchy_level: 2 },
    { role_name: "Manager", hierarchy_level: 3 },
    { role_name: "Employee", hierarchy_level: 4 },
    { role_name: "Intern", hierarchy_level: 5 },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
          customRoles: hierarchyType === "custom" ? customRoles : undefined
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
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      loading && setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-8 py-16">
      <div className="w-full max-w-2xl space-y-12">
        {/* Header */}
        <div className="space-y-6">
          <div className="flex items-center gap-6">
            <div className="p-6 border-brutal-thick bg-accent">
              <Building2 className="h-16 w-16 text-accent-foreground" />
            </div>
            <div>
              <h1 className="font-black uppercase leading-none">
                CREATE YOUR
                <br />
                ORGANIZATION
              </h1>
            </div>
          </div>
          <p className="text-xl font-bold uppercase border-l-4 border-foreground pl-6">START YOUR JOURNEY WITH LUMAN</p>
        </div>

        {/* Card */}
        <div className="border-brutal-thick shadow-brutal-lg bg-card p-12 space-y-8">
          <form onSubmit={handleCreate} className="space-y-8">
            <div className="space-y-3">
              <label htmlFor="orgName" className="block text-sm font-black uppercase tracking-wider">
                ORGANIZATION NAME
              </label>
              <input
                id="orgName"
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="ENTER YOUR ORGANIZATION NAME"
                required
                minLength={3}
                className="w-full border-brutal px-6 py-4 text-lg font-bold uppercase bg-background placeholder:text-muted-foreground placeholder:font-bold focus:outline-none focus:shadow-brutal"
              />
              <p className="text-sm font-bold uppercase opacity-70">THIS WILL BE YOUR ORGANIZATION'S DISPLAY NAME</p>
            </div>

            {/* Hierarchy Type Selection */}
            <div className="space-y-4">
              <label className="block text-sm font-black uppercase tracking-wider">
                HIERARCHY TYPE
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setHierarchyType("fixed")}
                  className={`p-6 border-brutal text-left transition-all ${
                    hierarchyType === "fixed"
                      ? "bg-accent text-accent-foreground shadow-brutal-sm"
                      : "bg-background text-foreground hover:bg-stone-50"
                  }`}
                >
                  <p className="font-black text-lg uppercase">Option 1: Fixed Hierarchy</p>
                  <p className="text-xs font-bold uppercase opacity-80 mt-2">Founder, Admin, Intern roles (Default)</p>
                </button>
                <button
                  type="button"
                  onClick={() => setHierarchyType("custom")}
                  className={`p-6 border-brutal text-left transition-all ${
                    hierarchyType === "custom"
                      ? "bg-accent text-accent-foreground shadow-brutal-sm"
                      : "bg-background text-foreground hover:bg-stone-50"
                  }`}
                >
                  <p className="font-black text-lg uppercase">Option 2: Custom Hierarchy</p>
                  <p className="text-xs font-bold uppercase opacity-80 mt-2">Define your own roles and levels</p>
                </button>
              </div>
            </div>

            {hierarchyType === "custom" && (
              <div className="border-brutal bg-muted p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="font-black uppercase tracking-wider text-sm">DEFINE ROLES (ORDER: HIGHEST TO LOWEST)</h3>
                  <button
                    type="button"
                    onClick={() => {
                      const newLevel = customRoles.length + 1;
                      setCustomRoles([...customRoles, { role_name: `ROLE ${newLevel}`, hierarchy_level: newLevel }]);
                    }}
                    className="px-4 py-2 border-brutal shadow-brutal-sm hover-brutal bg-background text-xs font-black uppercase"
                  >
                    + ADD ROLE
                  </button>
                </div>

                <div className="space-y-3">
                  {customRoles.map((role, idx) => (
                    <div key={idx} className="flex items-center gap-3 bg-background border-brutal p-3 shadow-brutal-sm">
                      <span className="font-black text-xs px-2 py-1 bg-black text-white">{role.hierarchy_level}</span>
                      <input
                        type="text"
                        value={role.role_name}
                        onChange={(e) => {
                          const updated = [...customRoles];
                          updated[idx].role_name = e.target.value;
                          setCustomRoles(updated);
                        }}
                        className="flex-1 bg-transparent border-none font-bold uppercase focus:outline-none"
                        placeholder="ROLE NAME"
                        required
                      />
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => {
                            if (idx === 0) return;
                            const updated = [...customRoles];
                            // swap
                            const temp = updated[idx].role_name;
                            updated[idx].role_name = updated[idx - 1].role_name;
                            updated[idx - 1].role_name = temp;
                            setCustomRoles(updated);
                          }}
                          className="p-1 border-brutal bg-stone-50 disabled:opacity-30"
                        >
                          &uarr;
                        </button>
                        <button
                          type="button"
                          disabled={idx === customRoles.length - 1}
                          onClick={() => {
                            if (idx === customRoles.length - 1) return;
                            const updated = [...customRoles];
                            // swap
                            const temp = updated[idx].role_name;
                            updated[idx].role_name = updated[idx + 1].role_name;
                            updated[idx + 1].role_name = temp;
                            setCustomRoles(updated);
                          }}
                          className="p-1 border-brutal bg-stone-50 disabled:opacity-30"
                        >
                          &darr;
                        </button>
                        <button
                          type="button"
                          disabled={customRoles.length <= 1}
                          onClick={() => {
                            if (customRoles.length <= 1) return;
                            const filtered = customRoles
                              .filter((_, i) => i !== idx)
                              .map((r, i) => ({ ...r, hierarchy_level: i + 1 }));
                            setCustomRoles(filtered);
                          }}
                          className="p-1 border-brutal bg-destructive text-destructive-foreground disabled:opacity-30 text-xs font-black"
                        >
                          X
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="px-6 py-4 text-sm font-black uppercase border-brutal bg-destructive text-destructive-foreground">
                {error.toUpperCase()}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full px-8 py-6 text-xl font-black uppercase border-brutal shadow-brutal hover-brutal bg-accent text-accent-foreground disabled:opacity-50 flex items-center justify-center gap-3"
            >
              <Plus className="h-6 w-6" />
              {loading ? "CREATING..." : "CREATE ORGANIZATION"}
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="text-center text-lg font-bold uppercase">
          <p>
            ALREADY HAVE AN ORGANIZATION?{" "}
            <Link
              href="/org-login"
              className="underline decoration-4 underline-offset-8 hover:bg-accent hover:text-accent-foreground px-2"
            >
              SIGN IN
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
