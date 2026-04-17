import Link from "next/link";
import { ShieldCheck, ArrowLeft } from "lucide-react";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#05080F] text-slate-200 px-6 py-14">
      <div className="max-w-4xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-[11px] font-black tracking-[0.2em] text-slate-500 hover:text-[#39FF14] uppercase mb-8">
          <ArrowLeft className="h-4 w-4" /> Back to Terminal
        </Link>

        <div className="mb-12 border-b border-white/10 pb-8 flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[#39FF14] shrink-0">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight">Terms of Service</h1>
            <p className="mt-2 text-sm text-slate-400">Last Updated: April 2026</p>
          </div>
        </div>

        <div className="prose prose-invert prose-slate max-w-none prose-headings:font-black prose-h2:text-2xl prose-h2:tracking-tight prose-a:text-[#39FF14] prose-a:no-underline hover:prose-a:underline">
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing and using RSIQ Pro, operated by Mindscape Analytics LLC ("we," "our," or "us"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our platform.
          </p>

          <h2>2. Non-Financial Advice (Crucial Disclaimer)</h2>
          <p>
            RSIQ Pro is a quantitative data aggregation and analysis tool. <strong>We are not financial advisors, brokers, or dealers.</strong> Any data, indicators, signals, or content provided by RSIQ Pro is strictly for informational and educational purposes. You understand and acknowledge that trading cryptocurrencies, forex, and commodities involves substantial risk of loss, and is not suitable for every investor. You are solely responsible for any decisions made based on the data provided by our software.
          </p>

          <h2>3. Subscription and Billing</h2>
          <p>
            Access to our premium features requires an active subscription. Payments are processed securely via third-party providers (e.g., Stripe, NOWPayments). By subscribing, you authorize us to charge your selected payment method. Subscriptions are billed in advance on a monthly or annual basis depending on your selected billing cycle.
          </p>

          <h2>4. Data Accuracy and Latency</h2>
          <p>
            While we strive to provide real-time, institutional-grade data, we do not guarantee the absolute accuracy, completeness, or timeliness of the market data presented. APIs and exchange uplinks can experience latency or downtime outside of our control. Mindscape Analytics LLC is not liable for any trading losses incurred due to delayed or inaccurate data.
          </p>

          <h2>5. Acceptable Use</h2>
          <p>
            You agree not to modify, reverse engineer, or attempt to extract the source code of RSIQ Pro. Automated scraping, malicious exploits, or attempts to bypass our authentication systems will result in immediate termination of your account without a refund.
          </p>

          <h2>6. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, Mindscape Analytics LLC shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of profits or revenues, whether incurred directly or indirectly, or any loss of data, use, goodwill, or other intangible losses.
          </p>

          <h2>7. Contact Us</h2>
          <p>
            If you have any questions about these Terms, please contact us via the support channels listed on our main website.
          </p>
        </div>
      </div>
    </div>
  );
}
