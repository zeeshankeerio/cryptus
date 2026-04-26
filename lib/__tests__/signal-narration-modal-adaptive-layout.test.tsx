/**
 * Test: Adaptive Signal Profile Layout (Task 5.2)
 * Requirements: 2.4, 3.1, 6.1, 9.3
 * 
 * This test verifies that the Signal Profile section maintains proper layout
 * across all breakpoints, with special attention to very small screens (320px).
 */

import { render, screen } from '@testing-library/react';
import { SignalNarrationModal } from '@/components/signal-narration-modal';
import type { SignalNarration } from '@/lib/signal-narration';
import type { ScreenerEntry } from '@/lib/types';

// Mock data for testing
const mockNarration: SignalNarration = {
  emoji: '🟢',
  headline: 'Strong Bullish Momentum Building - Multiple Confirmations',
  reasons: ['Test reason 1', 'Test reason 2'],
  conviction: 88,
  convictionLabel: 'VERY HIGH',
  timestamp: Date.now(),
};

const mockEntry: Partial<ScreenerEntry> = {
  symbol: 'BTCUSDT',
  price: 45000,
  rsi15m: 65.5,
  change24h: 3.2,
  confluence: 45,
  confluenceLabel: 'Bullish',
  momentum: 2.5,
  longCandle: true,
};

describe('SignalNarrationModal - Adaptive Signal Profile Layout (Task 5.2)', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    narration: mockNarration,
    symbol: 'BTCUSDT',
    entry: mockEntry as ScreenerEntry,
    tradingStyle: 'intraday' as const,
  };

  beforeEach(() => {
    // Reset viewport
    global.innerWidth = 1024;
    global.innerHeight = 768;
  });

  describe('Requirement 2.4: Signal Profile visibility across breakpoints', () => {
    it('should apply shrink-0 class to Signal Profile container', () => {
      const { container } = render(<SignalNarrationModal {...defaultProps} />);
      
      // Find the Signal Profile container (contains emoji and badges)
      const signalProfile = container.querySelector('.flex.items-center.gap-4.shrink-0');
      
      expect(signalProfile).toBeInTheDocument();
      expect(signalProfile).toHaveClass('shrink-0');
    });
  });

  describe('Requirement 3.1: Emoji icon fixed size', () => {
    it('should maintain w-12 h-12 fixed size for emoji icon', () => {
      const { container } = render(<SignalNarrationModal {...defaultProps} />);
      
      // Find the emoji container
      const emojiContainer = container.querySelector('.w-12.h-12.rounded-xl');
      
      expect(emojiContainer).toBeInTheDocument();
      expect(emojiContainer).toHaveClass('w-12', 'h-12');
      expect(emojiContainer?.textContent).toBe('🟢');
    });

    it('should maintain emoji size across all breakpoints', () => {
      const breakpoints = [320, 640, 768, 1024, 1920];
      
      breakpoints.forEach(width => {
        global.innerWidth = width;
        const { container } = render(<SignalNarrationModal {...defaultProps} />);
        
        const emojiContainer = container.querySelector('.w-12.h-12.rounded-xl');
        expect(emojiContainer).toHaveClass('w-12', 'h-12');
      });
    });
  });

  describe('Requirement 6.1: Badge row responsive gaps', () => {
    it('should have responsive gap classes on badge row', () => {
      const { container } = render(<SignalNarrationModal {...defaultProps} />);
      
      // Find the badge row (contains Live Feed, Signal Intel v3, Conviction, Trading Style)
      const badgeRow = container.querySelector('.flex.items-center.gap-1.sm\\:gap-1\\.5.lg\\:gap-2.mb-0\\.5');
      
      expect(badgeRow).toBeInTheDocument();
      expect(badgeRow).toHaveClass('gap-1');
    });

    it('should render all badges in the badge row', () => {
      const { container } = render(<SignalNarrationModal {...defaultProps} />);
      
      // Check for Live Feed badge
      expect(container.textContent).toContain('Live Feed');
      
      // Check for Signal Intel v3 badge
      expect(container.textContent).toContain('Signal Intel v3');
      
      // Check for Conviction badge
      expect(container.textContent).toContain('88% Conviction');
      
      // Check for Trading Style badge
      expect(container.textContent).toContain('intraday');
    });
  });

  describe('Requirement 9.3: Sub-metrics row responsive gaps and visibility', () => {
    it('should have responsive gap classes on sub-metrics row', () => {
      const { container } = render(<SignalNarrationModal {...defaultProps} />);
      
      // Find the sub-metrics row (contains Indic. Sync, Flow, Vol Spike, etc.)
      const subMetricsRow = container.querySelector('.flex.items-center.gap-1\\.5.sm\\:gap-2.lg\\:gap-3.mt-1\\.5');
      
      expect(subMetricsRow).toBeInTheDocument();
      expect(subMetricsRow).toHaveClass('gap-1.5');
    });

    it('should render Indicator Sync metric', () => {
      const { container } = render(<SignalNarrationModal {...defaultProps} />);
      
      expect(container.textContent).toContain('Indic. Sync:');
      expect(container.textContent).toContain('Bullish');
    });

    it('should render Flow metric', () => {
      const { container } = render(<SignalNarrationModal {...defaultProps} />);
      
      expect(container.textContent).toContain('Flow:');
      expect(container.textContent).toContain('2.5%');
    });

    it('should render Vol Spike when longCandle is true', () => {
      const { container } = render(<SignalNarrationModal {...defaultProps} />);
      
      expect(container.textContent).toContain('Vol Spike');
    });

    it('should remain visible and readable on mobile (320px)', () => {
      global.innerWidth = 320;
      const { container } = render(<SignalNarrationModal {...defaultProps} />);
      
      // Sub-metrics row should still be present
      const subMetricsRow = container.querySelector('.flex.items-center.gap-1\\.5.sm\\:gap-2.lg\\:gap-3.mt-1\\.5');
      expect(subMetricsRow).toBeInTheDocument();
      
      // Key metrics should be visible
      expect(container.textContent).toContain('Indic. Sync:');
      expect(container.textContent).toContain('Flow:');
    });
  });

  describe('Badge row wrapping behavior on very small screens (320px)', () => {
    it('should handle badge row layout at 320px viewport', () => {
      global.innerWidth = 320;
      const { container } = render(<SignalNarrationModal {...defaultProps} />);
      
      // Badge row should exist
      const badgeRow = container.querySelector('.flex.items-center.gap-1.sm\\:gap-1\\.5.lg\\:gap-2.mb-0\\.5');
      expect(badgeRow).toBeInTheDocument();
      
      // All badges should still be present (may wrap naturally with flex)
      expect(container.textContent).toContain('Live Feed');
      expect(container.textContent).toContain('Signal Intel v3');
      expect(container.textContent).toContain('88% Conviction');
      expect(container.textContent).toContain('intraday');
    });

    it('should maintain readable text sizes at 320px', () => {
      global.innerWidth = 320;
      const { container } = render(<SignalNarrationModal {...defaultProps} />);
      
      // Badge text should use text-[8px] or text-[10px] classes
      const liveFeedBadge = container.querySelector('.text-\\[8px\\].font-black.text-\\[\\#39FF14\\]');
      expect(liveFeedBadge).toBeInTheDocument();
    });
  });

  describe('Integration: Complete Signal Profile layout', () => {
    it('should render complete Signal Profile with all elements', () => {
      const { container } = render(<SignalNarrationModal {...defaultProps} />);
      
      // Emoji icon
      const emojiContainer = container.querySelector('.w-12.h-12.rounded-xl');
      expect(emojiContainer).toBeInTheDocument();
      
      // High conviction indicator (ping animation)
      const convictionIndicator = container.querySelector('.animate-ping');
      expect(convictionIndicator).toBeInTheDocument();
      
      // Badge row
      expect(container.textContent).toContain('Live Feed');
      expect(container.textContent).toContain('Signal Intel v3');
      
      // Headline
      expect(container.textContent).toContain('Strong Bullish Momentum Building');
      
      // Sub-metrics
      expect(container.textContent).toContain('Indic. Sync:');
      expect(container.textContent).toContain('Flow:');
    });

    it('should maintain layout integrity across breakpoint transitions', () => {
      const breakpoints = [320, 375, 640, 768, 1024, 1440, 1920];
      
      breakpoints.forEach(width => {
        global.innerWidth = width;
        const { container } = render(<SignalNarrationModal {...defaultProps} />);
        
        // Signal Profile should always have shrink-0
        const signalProfile = container.querySelector('.flex.items-center.gap-4.shrink-0');
        expect(signalProfile).toBeInTheDocument();
        
        // Emoji should always be w-12 h-12
        const emojiContainer = container.querySelector('.w-12.h-12.rounded-xl');
        expect(emojiContainer).toBeInTheDocument();
        
        // Headline should always be present
        expect(container.textContent).toContain('Strong Bullish Momentum Building');
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle missing optional data gracefully', () => {
      const propsWithMissingData = {
        ...defaultProps,
        entry: {
          ...mockEntry,
          confluence: undefined,
          confluenceLabel: undefined,
          momentum: undefined,
          longCandle: false,
        } as ScreenerEntry,
      };
      
      const { container } = render(<SignalNarrationModal {...propsWithMissingData} />);
      
      // Should still render Signal Profile
      const signalProfile = container.querySelector('.flex.items-center.gap-4.shrink-0');
      expect(signalProfile).toBeInTheDocument();
      
      // Should show fallback values
      expect(container.textContent).toContain('N/A');
    });

    it('should handle very long headlines with truncation', () => {
      const longHeadlineNarration = {
        ...mockNarration,
        headline: 'This is an extremely long headline that should be truncated to prevent layout overflow and maintain proper visual hierarchy across all breakpoints',
      };
      
      const { container } = render(<SignalNarrationModal {...defaultProps} narration={longHeadlineNarration} />);
      
      // Headline should have truncate class
      const headline = container.querySelector('.text-xl.font-black.text-white.tracking-tight.leading-none.truncate.max-w-md');
      expect(headline).toBeInTheDocument();
      expect(headline).toHaveClass('truncate', 'max-w-md');
    });
  });
});
