export const MINDSCAPE_LINKS = {
  home: "https://www.mindscapeanalytics.com/",
  about: "https://www.mindscapeanalytics.com/about",
  services: "https://www.mindscapeanalytics.com/services",
  projects: "https://www.mindscapeanalytics.com/projects",
  aiGenAi: "https://www.mindscapeanalytics.com/solutions/ai-genai",
  enterpriseSoftware: "https://www.mindscapeanalytics.com/solutions/enterprise-software",
  cloudInfrastructure: "https://www.mindscapeanalytics.com/solutions/cloud-infrastructure",
  contact: "https://www.mindscapeanalytics.com/contact",
  linkedin: "https://linkedin.com/company/mindscapeanalytics",
  whatsappStrategyCall: "https://wa.me/13072106155",
} as const;

type UTMOptions = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
};

export function withUTM(url: string, options: UTMOptions = {}): string {
  const source = options.source ?? "rsiq_pro";
  const medium = options.medium ?? "referral";
  const campaign = options.campaign ?? "mindscape_leadgen";

  const parsed = new URL(url);
  parsed.searchParams.set("utm_source", source);
  parsed.searchParams.set("utm_medium", medium);
  parsed.searchParams.set("utm_campaign", campaign);

  if (options.content) {
    parsed.searchParams.set("utm_content", options.content);
  }

  return parsed.toString();
}
