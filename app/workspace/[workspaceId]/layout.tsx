import { getMembership, requireUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;

  const session = await requireUser();
  if (!session) {
    redirect("/login");
  }

  const { user, supabase } = session;

  // Fetch workspace details (role, org_id)
  const { data: wsData } = await supabase
    .from("workspaces")
    .select("role, organization_id")
    .eq("id", workspaceId)
    .single();

  if (wsData?.organization_id) {
    const membership = await getMembership(wsData.organization_id, user.id);

    // Strict restriction: If workspace is "founder" and user is "intern", block completely.
    if (wsData.role === "founder" && membership?.role === "intern") {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-8">
          <div className="max-w-2xl w-full border-brutal-thick shadow-brutal p-12 space-y-8 bg-card text-center">
            <h1 className="text-6xl font-black uppercase text-destructive">403</h1>
            <h2 className="text-2xl font-black uppercase tracking-tight">Access Denied</h2>
            <p className="text-lg font-bold uppercase opacity-70">
              Only founders are permitted to view and manage this workspace.
            </p>
            <div className="pt-8">
              <Link
                href="/dashboard"
                className="inline-block px-8 py-4 text-lg font-black uppercase border-brutal hover-brutal bg-foreground text-background"
              >
                RETURN TO DASHBOARD
              </Link>
            </div>
          </div>
        </div>
      );
    }
  }

  return <>{children}</>;
}
