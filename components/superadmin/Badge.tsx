export function Badge({ children, variant }: { children: React.ReactNode; variant: "yellow" | "green" | "red" | "default" }) {
  const colors = {
    yellow: "bg-yellow-400/15 text-yellow-400",
    green: "bg-emerald-400/15 text-emerald-400",
    red: "bg-red-400/15 text-red-400",
    default: "bg-white/10 text-slate-300",
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-black ${colors[variant]}`}>
      {children}
    </span>
  );
}
