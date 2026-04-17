import Link from "next/link";
import { Shield, ArrowLeft } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#05080F] text-slate-200 px-6 py-14">
      <div className="max-w-4xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2 text-[11px] font-black tracking-[0.2em] text-slate-500 hover:text-[#39FF14] uppercase mb-8">
          <ArrowLeft className="h-4 w-4" /> Back to Terminal
        </Link>

        <div className="mb-12 border-b border-white/10 pb-8 flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[#39FF14] shrink-0">
            <Shield size={24} />
          </div>
          <div>
            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight">Privacy Policy</h1>
            <p className="mt-2 text-sm text-slate-400">Last Updated: April 2026</p>
          </div>
        </div>

        <div className="prose prose-invert prose-slate max-w-none prose-headings:font-black prose-h2:text-2xl prose-h2:tracking-tight prose-a:text-[#39FF14] prose-a:no-underline hover:prose-a:underline">
          <h2>1. Introduction</h2>
          <p>
            At Mindscape Analytics LLC, operating RSIQ Pro, we take your privacy and data security seriously. This policy explains how we collect, use, and protect your personal information when you use our web application and services.
          </p>

          <h2>2. Data We Collect</h2>
          <p>
            <strong>Account Information:</strong> When you register, we collect your email address, name, and basic authentication details to secure your terminal session.
            <br /><br />
            <strong>Usage Data:</strong> We may collect non-personally identifiable telemetry regarding how you interact with our application (e.g., features used, session duration) to improve system performance and algorithmic efficiency.
            <br /><br />
            <strong>Payment Information:</strong> We do not store your direct credit card numbers or crypto private keys. All transactions are securely processed by compliant third-party gateways (Stripe, NOWPayments).
          </p>

          <h2>3. How We Use Your Data</h2>
          <p>
            We use the information we collect to:
          </p>
          <ul>
            <li>Maintain, secure, and authenticate your user session.</li>
            <li>Process your subscription payments and deliver premium access.</li>
            <li>Send you critical administrative updates, alerts, and platform announcements.</li>
            <li>Analyze aggregate usage patterns to enhance our infrastructure.</li>
          </ul>

          <h2>4. Data Sharing and Security</h2>
          <p>
            <strong>We do not sell your personal data.</strong> Your data is only shared with essential third-party service providers (such as hosting, database infrastructure, and payment processors) strictly for the operational functionality of RSIQ Pro. 
            We employ modern encryption and enterprise-grade security protocols to protect your information from unauthorized access.
          </p>

          <h2>5. Your Rights</h2>
          <p>
            You have the right to access, modify, or permanently delete your account data. To request a full data deletion, you can contact us securely through your dashboard or our public contact channels.
          </p>

          <h2>6. Changes to this Policy</h2>
          <p>
            We may update this Privacy Policy periodically to reflect changes in our practices or regulatory requirements. We will notify you of any significant changes via email or an in-app notice.
          </p>
        </div>
      </div>
    </div>
  );
}
