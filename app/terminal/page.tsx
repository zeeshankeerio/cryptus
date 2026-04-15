// Cache shell for 5 minutes, but client-side real-time updates handle fresh data
export const revalidate = 300;

import Link from 'next/link';
import ScreenerDashboard from '@/components/screener-dashboard';
import { SubscriptionGate } from '@/components/subscription-gate';

export default function TerminalPage() {
  return (
    <div className="min-h-screen bg-[#05080F]">
      <SubscriptionGate>
        <ScreenerDashboard />
      </SubscriptionGate>
    </div>
  );
}
