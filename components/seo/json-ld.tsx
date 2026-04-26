import React from 'react';

/**
 * RSIQ Pro - Comprehensive JSON-LD Structured Data
 *
 * Covers:
 * - SoftwareApplication (Google App indexing)
 * - FinancialService (local/service search)
 * - Organization (brand knowledge panel)
 * - BreadcrumbList (site navigation)
 * - WebSite (sitelinks search box)
 * - FAQPage (rich results / featured snippets)
 */
export function JsonLd() {
  const BASE = 'https://rsiq.mindscapeanalytics.com';
  const LOGO = `${BASE}/logo/rsiq-mindscapeanalytics.png`;
  const OG   = `${BASE}/og-image.png`;

  // ── 1. SoftwareApplication ──────────────────────────────────
  const softwareSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${BASE}/#software`,
    name: 'RSIQ Pro',
    alternateName: ['RSIQ', 'RSI Screener Pro', 'Mindscape Analytics Terminal'],
    operatingSystem: 'Web, iOS, Android, PWA',
    applicationCategory: 'FinancialApplication',
    applicationSubCategory: 'Crypto Trading Terminal',
    url: BASE,
    downloadUrl: BASE,
    screenshot: OG,
    image: OG,
    featureList: [
      'Real-time RSI scanner for 500+ crypto pairs',
      'Institutional MACD, Bollinger Bands, Stochastic RSI',
      'Live liquidation feed (Binance + Bybit)',
      'Whale trade radar ($100K+ detection)',
      'Smart Money Pressure Index',
      'Order Flow analysis',
      'Funding rate heatmap',
      'Open Interest tracking',
      'Multi-timeframe RSI (1m, 5m, 15m, 1h)',
      'PWA - works offline on mobile',
      'Push notifications for extreme RSI signals',
    ],
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.9',
      ratingCount: '1250',
      bestRating: '5',
      worstRating: '1',
    },
    offers: [
      {
        '@type': 'Offer',
        name: 'Free Tier',
        price: '0.00',
        priceCurrency: 'USD',
        description: 'Basic crypto scanner with RSI and MACD',
      },
      {
        '@type': 'Offer',
        name: 'RSIQ Pro',
        price: '29.00',
        priceCurrency: 'USD',
        billingIncrement: 'P1M',
        description: 'Full institutional terminal with derivatives intelligence',
      },
    ],
    author: {
      '@type': 'Organization',
      name: 'Mindscape Analytics LLC',
      url: BASE,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Mindscape Analytics LLC',
      url: BASE,
    },
  };

  // ── 2. FinancialService ─────────────────────────────────────
  const serviceSchema = {
    '@context': 'https://schema.org',
    '@type': 'FinancialService',
    '@id': `${BASE}/#service`,
    name: 'Mindscape Analytics LLC',
    alternateName: 'RSIQ Pro',
    image: [LOGO, OG],
    url: BASE,
    description:
      'Enterprise-grade AI & Financial Engineering for institutional trading environments. Real-time crypto market scanner with RSI, MACD, Order Flow, and Liquidation Flux analytics.',
    serviceType: 'Cryptocurrency Market Intelligence',
    areaServed: 'Worldwide',
    openingHoursSpecification: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      opens: '00:00',
      closes: '23:59',
    },
    sameAs: [
      'https://twitter.com/MindscapeAL',
      'https://ee.linkedin.com/company/mindscapeanalytics',
    ],
  };

  // ── 3. Organization ─────────────────────────────────────────
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${BASE}/#organization`,
    name: 'Mindscape Analytics LLC',
    url: BASE,
    logo: {
      '@type': 'ImageObject',
      url: LOGO,
      width: 512,
      height: 512,
    },
    image: OG,
    description:
      'Enterprise-grade AI & Financial Engineering for Institutional Trading Environments. Creators of RSIQ Pro - the institutional crypto terminal.',
    foundingDate: '2024',
    sameAs: [
      'https://twitter.com/MindscapeAL',
      'https://ee.linkedin.com/company/mindscapeanalytics',
    ],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      url: `${BASE}/support`,
      availableLanguage: 'English',
    },
  };

  // ── 4. WebSite (enables Sitelinks Search Box) ───────────────
  const websiteSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${BASE}/#website`,
    url: BASE,
    name: 'RSIQ Pro',
    description: 'Institutional Crypto Terminal & Real-Time Market Scanner',
    publisher: { '@id': `${BASE}/#organization` },
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${BASE}/symbol/{search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  };

  // ── 5. BreadcrumbList ───────────────────────────────────────
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home',         item: BASE },
      { '@type': 'ListItem', position: 2, name: 'Terminal',     item: `${BASE}/terminal` },
      { '@type': 'ListItem', position: 3, name: 'Subscription', item: `${BASE}/subscription` },
      { '@type': 'ListItem', position: 4, name: 'About',        item: `${BASE}/about` },
      { '@type': 'ListItem', position: 5, name: 'Guide',        item: `${BASE}/guide` },
    ],
  };

  // ── 6. FAQPage (rich results / featured snippets) ───────────
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What is RSIQ Pro?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'RSIQ Pro is an institutional-grade crypto market scanner by Mindscape Analytics. It monitors 500+ trading pairs in real-time using RSI, MACD, Bollinger Bands, Order Flow, and Liquidation Flux analytics.',
        },
      },
      {
        '@type': 'Question',
        name: 'How does the Smart Money Pressure Index work?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'The Smart Money Pressure Index combines four signals: funding rate direction (20%), liquidation imbalance (30%), whale trade direction (25%), and order flow pressure (25%) into a composite score from -100 (Extreme Fear) to +100 (Extreme Greed).',
        },
      },
      {
        '@type': 'Question',
        name: 'Does RSIQ Pro work on mobile?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Yes. RSIQ Pro is a Progressive Web App (PWA) that works on iOS and Android. Install it from your browser for a native app experience with push notifications and offline support.',
        },
      },
      {
        '@type': 'Question',
        name: 'What exchanges does RSIQ Pro support?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'RSIQ Pro connects to Binance and Bybit for real-time data, covering crypto perpetual futures, spot markets, Forex, metals, and indices.',
        },
      },
      {
        '@type': 'Question',
        name: 'What is the liquidation tracker?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'The liquidation tracker monitors real-time forced liquidations from Binance and Bybit, showing long and short liquidations above $5K or $10K threshold, helping identify market stress points.',
        },
      },
    ],
  };

  const schemas = [
    softwareSchema,
    serviceSchema,
    organizationSchema,
    websiteSchema,
    breadcrumbSchema,
    faqSchema,
  ];

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schemas) }}
    />
  );
}
