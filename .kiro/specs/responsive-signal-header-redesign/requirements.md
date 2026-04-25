# Requirements Document

## Introduction

This document specifies the requirements for redesigning the Signal Narration Modal header to be fully responsive, compact, and professionally styled. The current header has design issues including decorative Unicode characters in code comments, poor mobile/tablet responsiveness with hidden critical information, excessive vertical space usage, and inflexible layout structure. This redesign will create a mobile-first, adaptive header that maintains all functionality while improving space efficiency and visual hierarchy across all screen sizes.

## Glossary

- **Signal_Narration_Modal**: The React component (`components/signal-narration-modal.tsx`) that displays institutional-grade signal analysis with comprehensive market data
- **Header_Section**: The top portion of the Signal Narration Modal containing signal profile, metrics ribbon, and action buttons
- **Metrics_Ribbon**: The center section of the header displaying 7 key metrics (Symbol, Price, 24h Change, RSI, Style, Bias, Win Rate)
- **Signal_Profile**: The left section of the header showing signal emoji, badges, headline, and sub-metrics
- **Breakpoint**: Tailwind CSS responsive design breakpoints (sm: 640px, md: 768px, lg: 1024px, xl: 1280px)
- **Viewport**: The visible area of the browser window at different screen sizes
- **Decorative_Characters**: Unicode box-drawing characters (──) used in code comments for visual separation
- **Responsive_Prefix**: Tailwind CSS class prefixes (sm:, md:, lg:, xl:) that apply styles at specific breakpoints
- **Visual_Hierarchy**: The arrangement of design elements by importance to guide user attention
- **Adaptive_Layout**: A layout that automatically adjusts structure and spacing based on viewport size

## Requirements

### Requirement 1: Remove Decorative Comment Characters

**User Story:** As a developer, I want clean, professional code comments without decorative Unicode characters, so that the codebase maintains professional standards and avoids rendering issues.

#### Acceptance Criteria

1. THE Signal_Narration_Modal SHALL NOT contain Unicode box-drawing characters (──) in code comments
2. WHEN code comments describe sections, THE Signal_Narration_Modal SHALL use standard double-slash (//) comment syntax
3. THE Signal_Narration_Modal SHALL replace all instances of decorative comment patterns with clean comment text
4. FOR ALL section comments in the component, parsing the comment text SHALL NOT encounter non-ASCII decorative characters

### Requirement 2: Implement Mobile-First Responsive Design

**User Story:** As a mobile user, I want to see all critical signal information on my phone, so that I can make informed trading decisions on any device.

#### Acceptance Criteria

1. WHEN the Viewport width is 320px or greater, THE Header_Section SHALL display all critical metrics without horizontal scrolling
2. THE Metrics_Ribbon SHALL NOT use `hidden` class without providing alternative display for mobile viewports
3. WHEN the Viewport is below 1024px (lg breakpoint), THE Header_Section SHALL reflow metrics into a mobile-optimized layout
4. THE Signal_Profile SHALL remain visible and readable at all Breakpoints from 320px to 1920px
5. FOR ALL screen sizes, the Header_Section SHALL preserve all data visibility (Symbol, Price, 24h Change, RSI, Style, Bias, Win Rate)

### Requirement 3: Create Adaptive Layout Structure

**User Story:** As a user on different devices, I want the header to automatically adjust its layout, so that information is optimally presented for my screen size.

#### Acceptance Criteria

1. WHEN the Viewport width is less than 640px (sm breakpoint), THE Header_Section SHALL stack elements vertically
2. WHEN the Viewport width is between 640px and 1024px, THE Header_Section SHALL use a two-column layout for metrics
3. WHEN the Viewport width is 1024px or greater, THE Header_Section SHALL display the three-section horizontal layout (Signal Profile, Metrics Ribbon, Actions)
4. THE Header_Section SHALL use Responsive_Prefix classes (sm:, md:, lg:, xl:) for all breakpoint-specific styling
5. FOR ALL Breakpoints, transitioning between viewport sizes SHALL NOT cause layout shifts or content overflow

### Requirement 4: Reduce Vertical Space Usage

**User Story:** As a user, I want a more compact header, so that I can see more signal analysis content without scrolling.

#### Acceptance Criteria

1. THE Header_Section SHALL reduce vertical padding from `py-4` to responsive values (py-2 sm:py-3 lg:py-4)
2. THE Header_Section SHALL reduce gap spacing between elements using responsive gap classes (gap-2 sm:gap-3 lg:gap-4)
3. WHEN displayed on desktop (1024px+), THE Header_Section vertical height SHALL be at least 20% less than the current implementation
4. THE Signal_Profile badge row SHALL use compact spacing (gap-1 sm:gap-1.5 lg:gap-2)
5. THE Header_Section SHALL maintain readability while reducing vertical space by at least 15% on mobile devices

### Requirement 5: Implement Flexible Horizontal Spacing

**User Story:** As a designer, I want spacing that adapts to screen size, so that the layout looks balanced on all devices.

#### Acceptance Criteria

1. THE Header_Section SHALL use responsive gap classes instead of fixed gap values
2. WHEN the Viewport width changes, THE Header_Section SHALL adjust horizontal spacing using Tailwind responsive prefixes
3. THE Metrics_Ribbon SHALL use responsive gap values (gap-2 sm:gap-4 lg:gap-6) between metric items
4. THE Signal_Profile sub-metrics SHALL use responsive gap values (gap-1.5 sm:gap-2 lg:gap-3)
5. FOR ALL horizontal spacing, the Header_Section SHALL scale proportionally with viewport width

### Requirement 6: Maintain Visual Hierarchy

**User Story:** As a trader, I want the most important information to stand out, so that I can quickly assess signal quality.

#### Acceptance Criteria

1. THE Signal_Profile headline SHALL remain the most prominent text element at all Breakpoints
2. THE conviction percentage badge SHALL maintain high visual prominence using color and size
3. WHEN the Viewport is mobile-sized, THE Header_Section SHALL prioritize displaying conviction, symbol, and price above other metrics
4. THE action buttons (Copy Brief, Close) SHALL remain easily accessible at all screen sizes
5. FOR ALL Breakpoints, the Visual_Hierarchy SHALL maintain the order: headline > conviction > symbol/price > secondary metrics

### Requirement 7: Preserve All Functionality

**User Story:** As a user, I want all header features to work on any device, so that I have full functionality regardless of screen size.

#### Acceptance Criteria

1. THE Header_Section SHALL maintain all existing Framer Motion animations at all Breakpoints
2. THE Copy Brief button SHALL remain functional and accessible on all viewport sizes
3. THE Close button SHALL remain functional and accessible on all viewport sizes
4. THE WinRateBadge component SHALL display correctly at all Breakpoints
5. FOR ALL interactive elements, click/touch targets SHALL be at least 44x44 pixels on mobile devices

### Requirement 8: Ensure Cross-Breakpoint Compatibility

**User Story:** As a developer, I want the header to work with existing Tailwind classes, so that the implementation integrates seamlessly with the current design system.

#### Acceptance Criteria

1. THE Header_Section SHALL use only existing Tailwind CSS utility classes
2. THE Header_Section SHALL NOT introduce custom CSS or inline styles
3. THE Header_Section SHALL maintain compatibility with the existing color scheme (bg-[#070B14], border-white/10, etc.)
4. THE Header_Section SHALL preserve all existing data prop interfaces (SignalNarrationModalProps)
5. FOR ALL styling changes, the Header_Section SHALL use Tailwind's responsive prefix system (sm:, md:, lg:, xl:)

### Requirement 9: Prevent Layout Issues

**User Story:** As a user, I want a stable layout without visual glitches, so that I can focus on the signal data.

#### Acceptance Criteria

1. THE Header_Section SHALL NOT cause horizontal scrolling at any viewport width from 320px to 1920px
2. WHEN content exceeds available space, THE Header_Section SHALL use truncation (truncate class) or wrapping (flex-wrap)
3. THE Header_Section SHALL NOT display overlapping elements at any Breakpoint
4. THE Metrics_Ribbon SHALL NOT overflow its container at any viewport size
5. FOR ALL viewport transitions, the Header_Section SHALL maintain smooth visual transitions without content jumping

### Requirement 10: Optimize Mobile Metrics Display

**User Story:** As a mobile user, I want to see key metrics in a compact format, so that I can quickly scan important data.

#### Acceptance Criteria

1. WHEN the Viewport is below 1024px, THE Metrics_Ribbon SHALL display in a grid layout (grid-cols-2 sm:grid-cols-3)
2. THE Metrics_Ribbon SHALL show the 4 most critical metrics on mobile (Symbol, Price, RSI, Bias)
3. WHEN the Viewport is between 640px and 1024px, THE Metrics_Ribbon SHALL display 6 metrics in a 3-column grid
4. THE Metrics_Ribbon SHALL use responsive text sizes (text-[10px] sm:text-xs) for labels
5. FOR ALL mobile layouts, metric values SHALL remain readable with minimum font size of 11px
