import type { ArtStyle, Ratio } from "@/lib/spec/schema";

export const ART_OPTIONS: { id: ArtStyle; label: string; hint: string; swatch: [string, string, string] }[] = [
  { id: "flat", label: "Flat", hint: "Clean, bright, modern", swatch: ["#4fb0f0", "#ffc93c", "#5fae4f"] },
  { id: "storybook", label: "Storybook", hint: "Ink outlines, paper texture", swatch: ["#d8bf98", "#3d4b5c", "#c0392b"] },
  { id: "bold", label: "Bold", hint: "Thick lines, punchy color", swatch: ["#16131f", "#ff6b81", "#5cc8ff"] },
  { id: "retro", label: "Retro", hint: "Muted 60s print, grain", swatch: ["#d9a066", "#4f7c6b", "#2e2a26"] },
];

export const RATIO_OPTIONS: { id: Ratio; label: string; hint: string }[] = [
  { id: "16:9", label: "16:9", hint: "YouTube" },
  { id: "9:16", label: "9:16", hint: "Shorts · Reels · TikTok" },
  { id: "1:1", label: "1:1", hint: "Square post" },
  { id: "4:5", label: "4:5", hint: "Instagram feed" },
];

export const LENGTH_OPTIONS = [
  { sec: 30, label: "30s" },
  { sec: 60, label: "1 min" },
  { sec: 90, label: "90s" },
  { sec: 150, label: "2½ min" },
];

export function Logo({ small }: { small?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className={`relative grid place-items-center rounded-xl bg-linear-to-br from-brand to-brand-2 font-display font-bold text-ink shadow-lg shadow-brand-2/20 ${small ? "h-8 w-8 text-base" : "h-9 w-9 text-lg"}`}
        aria-hidden
      >
        S
        <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-background bg-sky-400" />
      </span>
      <span className={`font-display font-semibold tracking-tight ${small ? "text-lg" : "text-xl"}`}>StoryMotion</span>
    </span>
  );
}

export function RatioIcon({ ratio, size = 16 }: { ratio: Ratio; size?: number }) {
  const [w, h] = ratio.split(":").map(Number);
  const s = size / Math.max(w, h);
  return (
    <span className="inline-flex items-center justify-center" style={{ width: size, height: size }} aria-hidden>
      <span className="rounded-[3px] border-[1.5px] border-current" style={{ width: w * s, height: h * s }} />
    </span>
  );
}

type IconProps = { className?: string };
const icon = (d: React.ReactNode) =>
  function Icon({ className = "h-4 w-4" }: IconProps) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
        {d}
      </svg>
    );
  };

export const SparklesIcon = icon(
  <>
    <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" />
    <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
  </>,
);
export const ArrowLeftIcon = icon(<path d="M19 12H5m6-6l-6 6 6 6" />);
export const DownloadIcon = icon(<path d="M12 4v11m0 0l-4-4m4 4l4-4M5 20h14" />);
export const UndoIcon = icon(<path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3" />);
export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </>,
);
export const CheckIcon = icon(<path d="M5 12l5 5 9-11" />);
export const SendIcon = icon(<path d="M5 12h14m-6-6l6 6-6 6" />);
export const BookIcon = icon(<path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zm0 0v16" />);
export const XIcon = icon(<path d="M6 6l12 12M18 6L6 18" />);
export const PlayIcon = icon(<path d="M7 5l12 7-12 7z" />);

export function Spinner({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={`animate-spin ${className}`} aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity={0.25} strokeWidth={3} fill="none" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth={3} fill="none" strokeLinecap="round" />
    </svg>
  );
}
