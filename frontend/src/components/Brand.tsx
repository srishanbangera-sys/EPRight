import { cx } from "@/lib/format";

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 32 32" className="size-7 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="8" fill={light ? "#ffffff" : "#15553c"} />
        <path d="M9 16.5l4.5 4.5L23 11.5" fill="none" stroke={light ? "#15553c" : "#ffffff"} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="24.5" cy="24.5" r="3" fill="#ea7a2c" />
      </svg>
      <span className={cx("text-[17px] font-semibold tracking-tight", light ? "text-white" : "text-slate-900")}>
        EPR<span className={light ? "text-brand-200" : "text-brand-600"}>ight</span>
      </span>
    </span>
  );
}

export function Disclaimer({ dark }: { dark?: boolean }) {
  return (
    <footer className={cx("border-t px-4 py-4 text-center text-xs sm:px-6", dark ? "border-white/10 text-white/50" : "border-slate-200/80 text-slate-400")}>
      Final figures must be confirmed on the official CPCB EPR portal. Demo data is sample data.
      <span className="hidden sm:inline"> EPRight does not issue EPR certificates or integrate with the CPCB portal. Payments and escrow are simulated.</span>
    </footer>
  );
}
