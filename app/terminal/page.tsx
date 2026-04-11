export const dynamic = "force-dynamic";
import Link from 'next/link';
import ScreenerDashboard from '@/components/screener-dashboard';
import { SubscriptionGate } from '@/components/subscription-gate';

export default function TerminalPage() {
  return (
    <div className="min-h-screen bg-[#05080F]">
      <div className="sticky top-0 z-40 border-b border-white/10 bg-[#05080F]/95 backdrop-blur px-4 py-3">
        <div className="max-w-[1800px] mx-auto flex items-center justify-end gap-3">
          <Link
            href="/subscription"
            className="rounded-lg border border-white/15 px-3 py-2 text-[10px] font-black tracking-[0.2em] uppercase text-slate-300 hover:text-[#39FF14] hover:border-[#39FF14]/40"
          >
            Subscription
          </Link>
          <Link
            href="/admin"
            className="rounded-lg border border-white/15 px-3 py-2 text-[10px] font-black tracking-[0.2em] uppercase text-slate-300 hover:text-[#39FF14] hover:border-[#39FF14]/40"
          >
            Admin
          </Link>
        </div>
      </div>
      <SubscriptionGate>
        <ScreenerDashboard />
      </SubscriptionGate>
    </div>
  );
}
