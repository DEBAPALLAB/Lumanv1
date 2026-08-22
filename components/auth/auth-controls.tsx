"use client";

import { Building2 } from "lucide-react";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

/**
 * Form primitives shared across the auth funnel, so /org-login, /login,
 * /org-register, /register and /join all use the same pill vocabulary.
 */

type PillTone = "gold" | "black" | "white" | "pink";

const TONE: Record<PillTone, string> = {
  gold: "bg-[#FBBF24] hover:bg-[#FACC15] text-black shadow-[5px_5px_0px_0px_rgba(0,0,0,1)]",
  black:
    "bg-black hover:bg-zinc-900 text-white shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] dark:shadow-[5px_5px_0px_0px_rgba(255,255,255,1)]",
  white: "bg-white text-black shadow-[5px_5px_0px_0px_rgba(0,0,0,1)]",
  pink: "bg-[#F9A8D4] hover:bg-[#F472B6] text-black shadow-[5px_5px_0px_0px_rgba(0,0,0,1)]",
};

export interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: PillTone;
  children: ReactNode;
}

export function PillButton({ tone = "gold", className = "", children, ...props }: PillButtonProps) {
  return (
    <button
      className={`w-full py-5 rounded-full border-[3px] border-black ${TONE[tone]} hover:shadow-none hover:translate-x-[5px] hover:translate-y-[5px] active:translate-x-[5px] active:translate-y-[5px] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 flex items-center justify-center gap-2.5 font-black uppercase text-xs tracking-wider focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-accent ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export interface PillInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Accent fill for the resting state. */
  tone?: "pink" | "plain";
}

export function PillInput({ tone = "plain", className = "", ...props }: PillInputProps) {
  const fill =
    tone === "pink"
      ? "bg-[#F9A8D4] text-black placeholder:text-black/60 focus:bg-white"
      : "bg-white dark:bg-zinc-900 text-black dark:text-white placeholder:text-black/40 dark:placeholder:text-white/40";

  return (
    <input
      className={`w-full border-[3px] border-black px-6 py-5 rounded-full text-xs font-black uppercase ${fill} text-center tracking-wider shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] focus:outline-none focus:ring-0 focus:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] focus-visible:ring-4 focus-visible:ring-accent transition-all ${className}`}
      {...props}
    />
  );
}

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-[11px] font-black uppercase tracking-wider text-foreground text-center"
    >
      {children}
    </label>
  );
}

export function FieldHint({ children }: { children: ReactNode }) {
  return (
    <p className="text-[9px] font-black uppercase text-center text-muted-foreground leading-relaxed tracking-wider">
      {children}
    </p>
  );
}

export function ErrorPill({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="px-5 py-3 text-[10px] font-black uppercase border-[3px] border-black bg-rose-500 text-white rounded-full text-center shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
    >
      ⚠ {children}
    </div>
  );
}

/** The green "you are acting on this workspace" chip used between steps. */
export function OrgBadge({ name, label = "Organization" }: { name: string; label?: string }) {
  return (
    <div className="border-[3px] border-black bg-[#D1FAE5] text-black p-4 rounded-2xl flex items-center gap-3.5 relative z-10 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] dark:shadow-[4px_4px_0px_0px_rgba(255,255,255,1)]">
      <div className="p-2 border-2 border-black bg-white rounded-lg shrink-0">
        <Building2 className="h-5 w-5 text-black" />
      </div>
      <div className="text-left">
        <p className="text-[8px] font-black uppercase opacity-60 leading-none">{label}</p>
        <p className="text-xs font-black uppercase text-black leading-tight tracking-tight mt-0.5">{name}</p>
      </div>
    </div>
  );
}

export function GoogleMark({ className = "h-5 w-5 shrink-0" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" role="img" aria-label="Google">
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
}

/** Two-step progress rail shown at the top of each funnel card. */
export function StepRail({ step, total = 2, labels }: { step: number; total?: number; labels?: string[] }) {
  return (
    <div className="flex items-center justify-center gap-2" aria-label={`Step ${step} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => {
        const index = i + 1;
        const done = index <= step;
        return (
          <div key={index} className="flex items-center gap-2">
            <span
              title={labels?.[i]}
              className={`h-2.5 rounded-full border-2 border-black transition-all ${
                done ? "w-8 bg-[#FBBF24]" : "w-2.5 bg-transparent"
              }`}
            />
          </div>
        );
      })}
    </div>
  );
}
