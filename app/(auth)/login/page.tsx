"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, ArrowRight } from "lucide-react";
import { signIn } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (values: LoginValues) => {
    setIsLoading(true);
    setError(null);

    try {
      await signIn.email(
        {
          email: values.email,
          password: values.password,
        },
        {
          onError: (ctx) => {
            setError(ctx.error.message || "Invalid credentials. Please try again.");
            setIsLoading(false);
          },
          onSuccess: () => {
            setSuccess("Connection Established. Accessing Terminal...");
            // Allow session cookie to fully propagate and refresh local state
            router.refresh();
            setTimeout(() => {
              router.push("/terminal");
            }, 800);
          }
        }
      );
    } catch (err) {
      console.error("Login error:", err);
      setError("An unexpected error occurred. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#05080F] flex font-sans selection:bg-[#39FF14]/30 text-white overflow-hidden">
      {/* Left Column: Form */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-8 sm:px-16 xl:px-32 relative z-10">
        <div className="w-full max-w-md mx-auto">
          <div className="mb-12">
            <Link href="/" className="inline-flex items-center gap-2 group mb-10 transition-transform hover:scale-[1.02]">
               <div className="relative w-40 h-10">
                  <Image 
                    src="/logo/rsiq-mindscapeanalytics.png" 
                    alt="RSIQ Pro" 
                    fill
                    className="object-contain"
                  />
               </div>
            </Link>

            <h1 className="text-4xl font-bold tracking-tight mb-3">Access Terminal</h1>
            <p className="text-slate-400 text-sm font-medium">Enter credentials to synchronize with market data.</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {error && (
              <div className="p-4 rounded-xl bg-[#722f37]/20 border border-[#722f37]/30 text-[#ff4b5c] text-xs font-black uppercase tracking-widest text-center animate-in fade-in zoom-in-95 duration-300">
                {error}
              </div>
            )}

            {success && (
              <div className="p-4 rounded-xl bg-[#39FF14]/10 border border-[#39FF14]/30 text-[#39FF14] text-xs font-black uppercase tracking-widest text-center animate-in fade-in zoom-in-95 duration-300">
                {success}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500 ml-1">Email Address</label>
              <input
                {...register("email")}
                type="email"
                placeholder="operator@rsia.pro"
                className={cn(
                  "w-full h-14 bg-[#141923] rounded-xl px-5 text-sm font-medium text-white placeholder:text-slate-600 transition-all focus:outline-none focus:ring-2 focus:ring-[#39FF14]/20 focus:bg-[#1c2330] border-none",
                  errors.email && "ring-2 ring-red-500/20"
                )}
              />
              {errors.email && <p className="text-[10px] text-red-500 font-bold mt-1 ml-1 uppercase letter-spacing-widest">{errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center ml-1">
                <label className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">Security Key</label>
                <Link href="#" className="text-[10px] font-black text-[#39FF14] hover:text-[#32e012] transition-colors uppercase tracking-widest">
                  Reset Key
                </Link>
              </div>
              <input
                {...register("password")}
                type="password"
                placeholder="••••••••••••"
                className={cn(
                  "w-full h-14 bg-[#141923] rounded-xl px-5 text-sm font-medium text-white placeholder:text-slate-600 transition-all focus:outline-none focus:ring-2 focus:ring-[#39FF14]/20 focus:bg-[#1c2330] border-none",
                  errors.password && "ring-2 ring-red-500/20"
                )}
              />
              {errors.password && <p className="text-[10px] text-red-500 font-bold mt-1 ml-1 uppercase letter-spacing-widest">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-14 bg-[#39FF14] hover:bg-[#32e012] text-black text-sm font-black uppercase tracking-[0.15em] rounded-xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-3 mt-8 shadow-lg"
            >
              {isLoading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <>
                  Connect to Network
                  <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
                </>
              )}
            </button>

            <p className="text-center text-slate-500 text-[11px] font-bold uppercase tracking-widest mt-6">
              Don't have terminal access?{" "}
              <Link href="/register" className="text-[#39FF14] hover:underline transition-all">
                Register Operator
              </Link>
            </p>
          </form>
        </div>
      </div>

      {/* Right Column: Clean Look */}
      <div className="hidden lg:flex lg:w-1/2 bg-[#05080F] items-center justify-center p-16 relative">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:60px_60px]" />

        <div className="relative w-full max-w-xl">
          <div className="space-y-12">
            <h2 className="text-[64px] font-bold text-white tracking-tighter leading-[1.05] selection:bg-[#39FF14] selection:text-black">
              The edge in crypto isn't predicting the future, it's analyzing the present faster than anyone else.
            </h2>

            <div className="flex flex-col gap-1">
              <span className="text-sm font-black text-white uppercase tracking-[0.3em]">Mindscape Analytics</span>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.5em]">Architects of Edge</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
