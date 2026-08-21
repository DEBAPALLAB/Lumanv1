"use client";

import { Building2, Check, Copy, Palette, Sparkles, UserPlus, Users, ArrowRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface OnboardingModalProps {
  isOpen: boolean;
  onSubmit: (name: string, color?: string) => Promise<void>;
  orgSlug?: string;
  orgName?: string;
  invitationCode?: string;
}

const WORKSPACE_COLORS = [
  { id: "stone", label: "Stone", bg: "bg-stone-300", border: "border-stone-400" },
  { id: "yellow", label: "Yellow", bg: "bg-[#FBBF24]", border: "border-amber-500" },
  { id: "green", label: "Green", bg: "bg-[#A7F3D0]", border: "border-emerald-500" },
  { id: "blue", label: "Blue", bg: "bg-blue-300", border: "border-blue-400" },
  { id: "purple", label: "Purple", bg: "bg-purple-300", border: "border-purple-400" },
  { id: "pink", label: "Pink", bg: "bg-pink-300", border: "border-pink-400" },
  { id: "orange", label: "Orange", bg: "bg-orange-300", border: "border-orange-400" },
];

export default function OnboardingModal({
  isOpen,
  onSubmit,
  orgSlug,
  orgName,
  invitationCode,
}: OnboardingModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [selectedColor, setSelectedColor] = useState("stone");
  const [submitting, setSubmitting] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  if (!isOpen) return null;

  const inviteLink =
    typeof window !== "undefined" && orgSlug && invitationCode
      ? `${window.location.origin}/join?org=${orgSlug}&code=${invitationCode}`
      : "";

  const handleCopyLink = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink);
    setCopiedLink(true);
    toast.success("Invite link copied to clipboard!");
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    if (!invitationCode) return;
    navigator.clipboard.writeText(invitationCode);
    setCopiedCode(true);
    toast.success("Invite code copied to clipboard!");
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    await onSubmit(name.trim(), selectedColor);
    setSubmitting(false);

    // If invitation code exists, advance to step 2 to show invite link
    if (invitationCode) {
      setStep(2);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 font-sans">
      <div className="w-full max-w-lg border-[4px] border-black dark:border-stone-100 bg-[#FDFBF7] dark:bg-zinc-900 shadow-[12px_12px_0px_0px_rgba(0,0,0,1)] dark:shadow-[12px_12px_0px_0px_rgba(255,255,255,1)] rounded-[32px] overflow-hidden text-black dark:text-stone-100">
        {/* Header Ribbon */}
        <div className="bg-[#FBBF24] p-6 border-b-[4px] border-black dark:border-stone-100 flex items-center justify-between text-black">
          <div className="flex items-center gap-3">
            <div className="p-2 border-2 border-black bg-white rounded-xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              <Sparkles className="h-5 w-5 text-black" />
            </div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight leading-none">
                {step === 1 ? "Welcome to Luman" : "Invite Your Teammates"}
              </h2>
              <p className="text-[10px] font-black uppercase tracking-wider opacity-75 mt-0.5">
                {orgName ? `Organization: ${orgName}` : "Setup & Onboarding"}
              </p>
            </div>
          </div>
          <span className="text-xs font-black uppercase px-3 py-1 bg-black text-white rounded-full">
            Step {step} of 2
          </span>
        </div>

        <div className="p-8">
          {step === 1 ? (
            <form onSubmit={handleCreateWorkspace} className="space-y-6">
              <div className="space-y-2">
                <p className="text-sm font-bold uppercase border-l-4 border-black dark:border-stone-100 pl-3 leading-relaxed">
                  To get started, let's create your team's first workspace for documents, notes, and tasks.
                </p>
              </div>

              <div className="space-y-2">
                <label htmlFor="onboardingWsName" className="block text-xs font-black uppercase tracking-wider text-stone-600 dark:text-stone-300">
                  Workspace Name *
                </label>
                <input
                  id="onboardingWsName"
                  autoFocus
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full border-[3px] border-black dark:border-stone-100 px-5 py-3.5 text-base font-bold uppercase bg-white dark:bg-zinc-800 text-black dark:text-stone-100 placeholder:text-stone-400 focus:outline-none focus:shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] rounded-2xl"
                  placeholder="E.G. GENERAL WORKSPACE"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-stone-600 dark:text-stone-300">
                  <Palette className="h-3.5 w-3.5" />
                  Accent Color
                </label>
                <div className="flex flex-wrap gap-2.5 pt-1">
                  {WORKSPACE_COLORS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelectedColor(c.id)}
                      className={`h-9 w-9 rounded-full border-[3px] border-black transition-all flex items-center justify-center ${c.bg} ${
                        selectedColor === c.id
                          ? "ring-2 ring-black dark:ring-white scale-110 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                          : "opacity-80 hover:opacity-100"
                      }`}
                    >
                      {selectedColor === c.id && <Check className="h-4 w-4 stroke-[3] text-black" />}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || !name.trim()}
                className="w-full py-4 rounded-2xl border-[3px] border-black dark:border-stone-100 bg-[#FBBF24] hover:bg-[#FACC15] text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all font-black uppercase text-sm tracking-wider flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {submitting ? "Creating Workspace..." : "Create & Continue"}
                <ArrowRight className="h-4 w-4 stroke-[3]" />
              </button>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="space-y-2 text-center">
                <div className="inline-flex p-3 border-[3px] border-black bg-[#A7F3D0] rounded-2xl shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] mb-2">
                  <Users className="h-7 w-7 text-black" />
                </div>
                <h3 className="text-xl font-black uppercase tracking-tight">Your Workspace is Ready!</h3>
                <p className="text-xs font-bold uppercase text-stone-500 dark:text-stone-400">
                  Share this invitation link with your teammates so they can join instantly.
                </p>
              </div>

              {/* Invitation Code Display */}
              <div className="border-[3px] border-black bg-white dark:bg-zinc-800 p-4 rounded-2xl space-y-3 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-stone-400">
                    Organization Code
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="inline-flex items-center gap-1 text-[10px] font-black uppercase underline hover:text-[#059669]"
                  >
                    {copiedCode ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copiedCode ? "Copied" : "Copy Code"}
                  </button>
                </div>
                <div className="text-2xl font-black tracking-widest text-center font-mono bg-stone-100 dark:bg-zinc-900 py-2 border-2 border-dashed border-stone-300 dark:border-zinc-700 rounded-xl">
                  {invitationCode}
                </div>
              </div>

              {/* Shareable Link Box */}
              {inviteLink && (
                <div className="space-y-2">
                  <label className="block text-xs font-black uppercase tracking-wider text-stone-600 dark:text-stone-300">
                    Direct Invite Link
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={inviteLink}
                      className="flex-1 border-[3px] border-black dark:border-stone-100 px-4 py-2.5 text-xs font-mono bg-white dark:bg-zinc-800 text-black dark:text-stone-100 rounded-xl truncate"
                    />
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="px-4 py-2.5 border-[3px] border-black dark:border-stone-100 bg-[#A7F3D0] hover:bg-[#6EE7B7] text-black font-black uppercase text-xs rounded-xl shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[1px] hover:translate-y-[1px] transition-all shrink-0 flex items-center gap-1.5"
                    >
                      {copiedLink ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedLink ? "Copied" : "Copy Link"}
                    </button>
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => {
                  window.location.reload();
                }}
                className="w-full py-4 rounded-2xl border-[3px] border-black dark:border-stone-100 bg-black dark:bg-white text-white dark:text-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all font-black uppercase text-sm tracking-wider"
              >
                Enter Dashboard &rarr;
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
