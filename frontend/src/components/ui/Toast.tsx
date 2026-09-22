import { AlertCircle, CheckCircle2 } from "lucide-react";

type ToastProps = {
  toast: { message: string; type: "success" | "error" } | null;
};

export default function Toast({ toast }: ToastProps) {
  if (!toast) return null;
  return (
    <div
      role={toast.type === "error" ? "alert" : "status"}
      aria-live={toast.type === "error" ? "assertive" : "polite"}
      className={`pointer-events-none fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-[100] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-md border px-5 py-4 ${toast.type === "success" ? "border-emerald-400/30 bg-emerald-950 text-emerald-200" : "border-rose-400/30 bg-rose-950 text-rose-200"}`}
    >
      {toast.type === "success" ? (
        <CheckCircle2 className="shrink-0" size={20} />
      ) : (
        <AlertCircle className="shrink-0" size={20} />
      )}
      <span className="font-semibold">{toast.message}</span>
    </div>
  );
}
