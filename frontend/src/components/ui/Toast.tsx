import React from 'react';

type ToastProps = {
  toast: { message: string; type: 'success' | 'error' } | null;
};

export default function Toast({ toast }: ToastProps) {
  if (!toast) return null;
  return (
    <div className={`fixed top-8 left-1/2 transform -translate-x-1/2 px-8 py-4 rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.5)] font-bold text-sm z-[100] flex items-center justify-center transition-all animate-in fade-in slide-in-from-top-4 backdrop-blur-md ${
      toast.type === 'success' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 'bg-red-500/20 text-red-400 border border-red-500/50'
    }`}>
      {toast.message}
    </div>
  );
}