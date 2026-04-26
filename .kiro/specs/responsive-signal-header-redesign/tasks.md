# Implementation Plan: Responsive Signal Header Redesign

## Overview

This implementation plan converts the responsive signal header design into discrete coding tasks. The redesign transforms the Signal Narration Modal header from a desktop-only layout with hidden mobile metrics into a fully responsive, mobile-first component. The implementation will remove decorative Unicode characters, implement adaptive layouts across three breakpoints (mobile <640px, tablet 640-1024px, desktop 1024px+), reduce vertical space by 20% on desktop and 15% on mobile, and ensure all critical trading metrics are visible on every device.

**Target File**: `components/signal-narration-modal.tsx` (header section, lines ~140-240)

**Technology Stack**: TypeScript, React, Tailwind CSS, Framer Motion

**Key Design Principles**:
- Mobile-first responsive design (320px minimum width)
- Metric priority system (critical/secondary/tertiary)
- Adaptive layout transformation (vertical → two-column → three-section)
- Space efficiency through responsive padding/gap classes
- Preserve all functionality (animations, buttons, WinRateBadge)

## Tasks

- [x] 1. Clean up code quality and remove decorative characters
  - Remove all Unicode box-drawing characters (──) from comments in `signal-narration-modal.tsx`
  - Replace decorative comment patterns with clean standard comments
  - Update section comments: `// ── Helpers ──` → `// Helpers`, `// ── Render ──` → `// Render`
  - Verify no non-ASCII decorative characters remain in the header section
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Implement responsive metrics ribbon with priority-based filtering
  - [x] 2.1 Create MetricConfig interface and metrics configuration array
    - Define `MetricConfig` interface with `label`, `value`, `color`, `priority`, and optional `dot` properties
    - Create `metricsConfig` array with all 7 metrics (Symbol, Price, RSI, Bias, 24h Δ, Style, Win Rate)
    - Assign priority levels: critical (Symbol, Price, RSI, Bias), secondary (24h Δ, Style), tertiary (Win Rate)
    - Implement helper functions: `getRSIColor()`, `getChangeColor()` for dynamic metric coloring
    - _Requirements: 2.5, 10.2, 10.3_
  
  - [ ]* 2.2 Write unit tests for MetricConfig and priority filtering
    - Test that critical metrics are correctly identified (4 metrics)
    - Test that secondary metrics are correctly identified (2 metrics)
    - Test that tertiary metrics are correctly identified (1 metric)
    - Test color helper functions with various input values
    - _Requirements: 2.5, 10.2_
  
  - [x] 2.3 Implement desktop metrics ribbon (1024px+)
    - Replace existing `hidden lg:flex` metrics div with new structure
    - Use `hidden lg:flex` for desktop-only horizontal layout
    - Apply responsive gap classes: `gap-2 sm:gap-4 lg:gap-6`
    - Maintain border styling: `border-x border-white/5 mx-2`
    - Map over `metricsConfig` array to render all 7 metrics
    - Preserve WinRateBadge component with `scale-75 origin-left` styling
    - _Requirements: 2.2, 2.3, 3.3, 5.2, 5.3_
  
  - [x] 2.4 Implement mobile/tablet metrics grid (<1024px)
    - Create new `lg:hidden` div for mobile/tablet layouts
    - Implement 2-column grid for mobile: `grid grid-cols-2 gap-2`
    - Implement 3-column grid for tablet: `sm:grid-cols-3 sm:gap-3`
    - Apply responsive padding: `px-3 sm:px-4`
    - Filter metrics by priority: mobile shows critical (4), tablet shows critical + secondary (6)
    - Add `data-testid` attributes for testing: `mobile-metric`, `tablet-metric`
    - _Requirements: 2.1, 2.3, 3.1, 3.2, 10.1, 10.2, 10.3_
  
  - [ ]* 2.5 Write snapshot tests for metrics ribbon at all breakpoints
    - Snapshot test at 320px (mobile - 4 metrics)
    - Snapshot test at 768px (tablet - 6 metrics)
    - Snapshot test at 1024px (desktop - 7 metrics)
    - Snapshot test at 1920px (large desktop - 7 metrics)
    - _Requirements: 2.1, 2.3, 3.1, 3.2, 3.3_

- [x] 3. Optimize header container spacing and layout
  - [x] 3.1 Apply responsive padding to header container
    - Update header container padding from fixed `py-4` to responsive `py-2 sm:py-3 lg:py-4`
    - Update horizontal padding from fixed `px-5` to responsive `px-3 sm:px-4 lg:px-5`
    - Verify 20% vertical space reduction on desktop (measure before/after height)
    - Verify 15% vertical space reduction on mobile (measure before/after height)
    - _Requirements: 4.1, 4.3, 4.5_
  
  - [x] 3.2 Apply responsive gap spacing throughout header
    - Update main flex container gap from `gap-6` to `gap-2 sm:gap-4 lg:gap-6`
    - Update Signal Profile badge row gap to `gap-1 sm:gap-1.5 lg:gap-2`
    - Update Signal Profile sub-metrics gap to `gap-1.5 sm:gap-2 lg:gap-3`
    - Update action buttons gap to `gap-1.5 sm:gap-2`
    - _Requirements: 4.2, 4.4, 5.1, 5.2, 5.4, 5.5_
  
  - [ ]* 3.3 Write unit tests for spacing calculations
    - Test that desktop header height is reduced by at least 20%
    - Test that mobile header height is reduced by at least 15%
    - Test that gap spacing scales correctly across breakpoints
    - _Requirements: 4.3, 4.5, 5.5_

- [x] 4. Implement responsive text sizing and truncation
  - [x] 4.1 Apply responsive text sizes to metric labels and values
    - Update metric labels from `text-[8px]` to `text-[8px] sm:text-[9px]`
    - Update metric values from `text-xs` to `text-[10px] sm:text-xs`
    - Ensure minimum font size of 11px for readability on mobile
    - Add `data-testid="metric-value"` for testing
    - _Requirements: 10.4, 10.5_
  
  - [x] 4.2 Implement headline truncation for mobile
    - Verify headline has `truncate` class applied
    - Verify headline container has `max-w-md` constraint
    - Test headline truncation with long signal headlines (50+ characters)
    - Ensure truncation works across all breakpoints
    - _Requirements: 6.1, 9.2_
  
  - [ ]* 4.3 Write accessibility tests for text sizing
    - Test that all text meets minimum readable font size (11px)
    - Test that headline truncation doesn't break accessibility
    - Test color contrast ratios for all text elements
    - _Requirements: 10.5_

- [x] 5. Ensure responsive layout stability and prevent overflow
  - [x] 5.1 Add overflow prevention classes
    - Apply `overflow-hidden` to header container
    - Verify no horizontal scrolling from 320px to 1920px
    - Test with long symbol names (e.g., "BTCUSDTPERP")
    - Test with extreme metric values (e.g., price: 1,234,567.89)
    - _Requirements: 9.1, 9.2, 9.3_
  
  - [x] 5.2 Implement adaptive Signal Profile layout
    - Ensure Signal Profile uses `shrink-0` to prevent compression
    - Verify emoji icon maintains fixed size (w-12 h-12) across breakpoints
    - Test badge row wrapping behavior on very small screens (320px)
    - Ensure sub-metrics row remains visible and readable on mobile
    - _Requirements: 2.4, 3.1, 6.1, 9.3_
  
  - [ ]* 5.3 Write integration tests for layout stability
    - Test no horizontal overflow at 320px, 375px, 768px, 1024px, 1920px
    - Test no overlapping elements at any breakpoint
    - Test smooth transitions between breakpoints (639px → 640px, 1023px → 1024px)
    - _Requirements: 3.5, 9.1, 9.3, 9.4, 9.5_

- [x] 6. Checkpoint - Verify responsive behavior and run tests
  - Manually test header at 320px, 375px, 768px, 1024px, 1440px, 1920px viewport widths
  - Verify all 7 metrics are visible on desktop (1024px+)
  - Verify 6 metrics are visible on tablet (640-1024px)
  - Verify 4 critical metrics are visible on mobile (<640px)
  - Run all unit tests and snapshot tests
  - Ensure all tests pass, ask the user if questions arise

- [ ] 7. Preserve functionality and interactive elements
  - [ ] 7.1 Verify Copy Brief button functionality across breakpoints
    - Test Copy Brief button at 320px, 768px, 1024px, 1920px
    - Verify button maintains minimum 44x44px touch target on mobile
    - Test button hover states and transitions
    - Verify clipboard API functionality works on all devices
    - _Requirements: 7.2, 7.5_
  
  - [ ] 7.2 Verify Close button functionality across breakpoints
    - Test Close button at 320px, 768px, 1024px, 1920px
    - Verify button maintains minimum 44x44px touch target on mobile
    - Test button hover states and transitions
    - Verify onClose callback fires correctly
    - _Requirements: 7.3, 7.5_
  
  - [ ] 7.3 Verify Framer Motion animations are preserved
    - Test modal entrance animation (opacity, scale, y transform)
    - Test modal exit animation
    - Verify animations work smoothly across all breakpoints
    - Ensure no animation performance issues on mobile devices
    - _Requirements: 7.1_
  
  - [ ]* 7.4 Write integration tests for interactive elements
    - Test Copy Brief button click handler across breakpoints
    - Test Close button click handler across breakpoints
    - Test touch target sizes meet 44x44px minimum on mobile
    - Test Framer Motion animations are applied correctly
    - _Requirements: 7.1, 7.2, 7.3, 7.5_

- [ ] 8. Maintain visual hierarchy and design consistency
  - [ ] 8.1 Verify conviction badge prominence
    - Test conviction badge visibility at all breakpoints
    - Verify high-conviction styling (88%+) with glow effect
    - Test conviction color coding (green, emerald, yellow, orange, slate)
    - Ensure conviction badge remains prominent in mobile layout
    - _Requirements: 6.2, 6.4_
  
  - [ ] 8.2 Verify headline prominence and hierarchy
    - Test headline font size and weight at all breakpoints
    - Verify headline is the most prominent text element
    - Test headline truncation doesn't break visual hierarchy
    - Ensure headline remains readable on mobile (text-lg sm:text-xl)
    - _Requirements: 6.1, 6.5_
  
  - [ ] 8.3 Verify metric priority display on mobile
    - Test that Symbol, Price, RSI, Bias are displayed on mobile (critical)
    - Test that 24h Δ and Style are added on tablet (secondary)
    - Test that Win Rate is added on desktop (tertiary)
    - Verify visual hierarchy: headline > conviction > symbol/price > secondary metrics
    - _Requirements: 6.3, 6.5_
  
  - [ ]* 8.4 Write visual regression tests
    - Capture screenshots at 320px, 768px, 1024px, 1920px
    - Test with high conviction signal (88%+)
    - Test with low conviction signal (32%)
    - Test with missing data (no RSI, no price)
    - Compare against baseline images
    - _Requirements: 6.1, 6.2, 6.3, 6.5_

- [ ] 9. Ensure Tailwind CSS compatibility and code quality
  - [ ] 9.1 Verify all classes use Tailwind utility classes
    - Audit header section for any custom CSS or inline styles
    - Verify all responsive classes use Tailwind prefixes (sm:, md:, lg:, xl:)
    - Ensure color scheme consistency (bg-[#070B14], border-white/10, etc.)
    - Verify no new custom CSS classes are introduced
    - _Requirements: 8.1, 8.2, 8.3, 8.5_
  
  - [ ] 9.2 Verify TypeScript interfaces are preserved
    - Ensure `SignalNarrationModalProps` interface is unchanged
    - Verify all prop types are correctly used in the component
    - Test that TypeScript compilation succeeds with no errors
    - Ensure no breaking changes to component API
    - _Requirements: 8.4_
  
  - [ ]* 9.3 Write type safety tests
    - Test that component accepts all valid prop combinations
    - Test that TypeScript catches invalid prop types
    - Test that optional props work correctly (entry, rsiPeriod, etc.)
    - _Requirements: 8.4_

- [ ] 10. Final checkpoint and accessibility audit
  - Run full test suite (unit, snapshot, integration, accessibility)
  - Verify WCAG 2.1 AA compliance (color contrast, touch targets, text size)
  - Test with screen readers (VoiceOver on iOS, TalkBack on Android)
  - Verify no horizontal scrolling at any viewport width (320px-1920px)
  - Test on real devices (iPhone SE, iPad, Desktop)
  - Verify smooth transitions between breakpoints
  - Check performance (no layout thrashing, smooth animations)
  - Ensure all tests pass, ask the user if questions arise

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at critical milestones
- All styling uses Tailwind CSS utility classes (no custom CSS)
- Component maintains full backward compatibility with existing props
- Mobile-first approach ensures progressive enhancement
- Metric priority system ensures critical data is always visible
- Responsive spacing scales proportionally with viewport width
- All interactive elements maintain minimum 44x44px touch targets on mobile
