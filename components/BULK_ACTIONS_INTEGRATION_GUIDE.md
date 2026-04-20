# Bulk Actions Integration Guide for ScreenerDashboard

This document provides step-by-step instructions for integrating the bulk actions functionality into `components/screener-dashboard.tsx`.

## Overview

The bulk actions feature allows users to select multiple symbols and apply configuration changes (priority, sound, quiet hours, templates) to all selected symbols at once.

## Components Already Created

✅ `components/bulk-actions-toolbar.tsx` - Floating action bar
✅ `components/bulk-confirmation-dialog.tsx` - Confirmation modal
✅ `components/priority-selector.tsx` - Priority selection (already exists)
✅ `components/sound-selector.tsx` - Sound selection (already exists)

## Integration Steps

### Step 1: Add Imports (Top of file)

```typescript
import { BulkActionsToolbar } from './bulk-actions-toolbar';
import { BulkConfirmationDialog, type BulkActionConfig } from './bulk-confirmation-dialog';
import { CheckSquare, Square } from 'lucide-react'; // For checkboxes
```

### Step 2: Add State Variables (Around line 2410, near watchlist state)

```typescript
// Bulk Actions State
const [bulkMode, setBulkMode] = useState(false);
const [selectedSymbols, setSelectedSymbols] = useState<Set<string>>(new Set());
const [bulkActionConfig, setBulkActionConfig] = useState<BulkActionConfig | null>(null);
const [showBulkConfirmation, setShowBulkConfirmation] = useState(false);
const [isBulkProcessing, setIsBulkProcessing] = useState(false);
```

### Step 3: Add Bulk Selection Handlers (Around line 3250, after toggleWatchlist)

```typescript
// Toggle bulk mode on/off
const toggleBulkMode = useCallback(() => {
  setBulkMode(prev => !prev);
  if (bulkMode) {
    // Exiting bulk mode - clear selections
    setSelectedSymbols(new Set());
  }
}, [bulkMode]);

// Toggle individual symbol selection
const toggleSymbolSelection = useCallback((symbol: string) => {
  setSelectedSymbols(prev => {
    const next = new Set(prev);
    if (next.has(symbol)) {
      next.delete(symbol);
    } else {
      next.add(symbol);
    }
    return next;
  });
}, []);

// Select all visible symbols
const selectAllSymbols = useCallback(() => {
  const visibleSymbols = filtered.map(e => e.symbol);
  setSelectedSymbols(new Set(visibleSymbols));
}, [filtered]);

// Clear all selections
const clearAllSelections = useCallback(() => {
  setSelectedSymbols(new Set());
}, []);
```

### Step 4: Add Bulk Action Handlers

```typescript
// Handle bulk action button clicks
const handleBulkAction = useCallback((actionId: 'priority' | 'sound' | 'quietHours' | 'template') => {
  // For now, show a simple config dialog
  // In production, you'd show appropriate UI for each action type
  
  switch (actionId) {
    case 'priority':
      // Show priority selector dialog
      setBulkActionConfig({
        type: 'priority',
        priority: 'medium' // Default, should be selected by user
      });
      setShowBulkConfirmation(true);
      break;
      
    case 'sound':
      // Show sound selector dialog
      setBulkActionConfig({
        type: 'sound',
        sound: 'default' // Default, should be selected by user
      });
      setShowBulkConfirmation(true);
      break;
      
    case 'quietHours':
      // Show quiet hours config dialog
      setBulkActionConfig({
        type: 'quietHours',
        quietHoursEnabled: true,
        quietHoursStart: 22,
        quietHoursEnd: 8
      });
      setShowBulkConfirmation(true);
      break;
      
    case 'template':
      // Show template selector dialog
      toast.info('Template selection coming soon');
      break;
  }
}, []);

// Execute bulk action after confirmation
const executeBulkAction = useCallback(async () => {
  if (!bulkActionConfig || selectedSymbols.size === 0) return;
  
  setIsBulkProcessing(true);
  
  try {
    // Prepare updates based on action type
    const updates: Record<string, any> = {};
    
    switch (bulkActionConfig.type) {
      case 'priority':
        updates.priority = bulkActionConfig.priority;
        break;
      case 'sound':
        updates.sound = bulkActionConfig.sound;
        break;
      case 'quietHours':
        updates.quietHoursEnabled = bulkActionConfig.quietHoursEnabled;
        updates.quietHoursStart = bulkActionConfig.quietHoursStart;
        updates.quietHoursEnd = bulkActionConfig.quietHoursEnd;
        break;
    }
    
    // Call bulk API
    const response = await fetch('/api/config/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'update',
        symbols: Array.from(selectedSymbols),
        updates
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Bulk update failed');
    }
    
    const result = await response.json();
    
    // Show success message
    toast.success(`Updated ${result.processed} symbols successfully`, {
      description: result.failed > 0 ? `${result.failed} symbols failed to update` : undefined
    });
    
    // Refresh coin configs
    await loadCoinConfigs();
    
    // Clear selections and exit bulk mode
    setSelectedSymbols(new Set());
    setBulkMode(false);
    setShowBulkConfirmation(false);
    setBulkActionConfig(null);
    
  } catch (error: any) {
    console.error('[bulk-action] Failed:', error);
    toast.error('Bulk action failed', {
      description: error.message || 'Please try again'
    });
  } finally {
    setIsBulkProcessing(false);
  }
}, [bulkActionConfig, selectedSymbols, loadCoinConfigs]);
```

### Step 5: Add Bulk Actions Button to Toolbar (Around line 4332)

Add this button after the Settings button:

```typescript
{/* Bulk Actions Button */}
<button
  onClick={toggleBulkMode}
  className={cn(
    "h-full px-3 rounded-2xl border transition-all",
    bulkMode
      ? "bg-[#39FF14]/10 border-[#39FF14]/30 text-[#39FF14] shadow-[0_0_10px_rgba(57,255,20,0.1)]"
      : "bg-white/5 border-white/10 text-slate-500 hover:text-[#39FF14] hover:bg-[#39FF14]/5"
  )}
  title={bulkMode ? "Exit Bulk Mode" : "Bulk Actions"}
>
  {bulkMode ? <CheckSquare size={14} /> : <Square size={14} />}
</button>
```

### Step 6: Add Checkbox Column to Table Header (Around line 4850)

Add this as the first column header (before rank or star):

```typescript
{bulkMode && (
  <th className="sticky left-0 z-30 bg-[#0A0F1B]/95 px-3 py-3 w-[44px] min-w-[44px]">
    <button
      onClick={selectedSymbols.size === filtered.length ? clearAllSelections : selectAllSymbols}
      className="flex items-center justify-center w-full h-full text-slate-500 hover:text-[#39FF14] transition-colors"
      title={selectedSymbols.size === filtered.length ? "Deselect All" : "Select All"}
    >
      {selectedSymbols.size === filtered.length ? (
        <CheckSquare size={14} className="text-[#39FF14]" />
      ) : selectedSymbols.size > 0 ? (
        <MinusCircle size={14} className="text-[#39FF14]" />
      ) : (
        <Square size={14} />
      )}
    </button>
  </th>
)}
```

### Step 7: Pass Bulk Props to ScreenerRow (Around line 4971)

Add these props to the ScreenerRow component:

```typescript
<ScreenerRow
  // ... existing props ...
  bulkMode={bulkMode}
  isSelected={selectedSymbols.has(entry.symbol)}
  onToggleSelection={toggleSymbolSelection}
/>
```

### Step 8: Update ScreenerRow Component (In the ScreenerRow memo function, around line 1700)

Add these props to the ScreenerRow interface:

```typescript
interface ScreenerRowProps {
  // ... existing props ...
  bulkMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: (symbol: string) => void;
}
```

Add checkbox cell as first cell in the row (before rank or star):

```typescript
{bulkMode && (
  <td className="sticky left-0 z-10 px-3 py-4 bg-[#0A0F1B]/95 w-[44px] min-w-[44px]">
    <button
      onClick={() => onToggleSelection?.(entry.symbol)}
      className="flex items-center justify-center w-full h-full text-slate-500 hover:text-[#39FF14] transition-colors"
    >
      {isSelected ? (
        <CheckSquare size={14} className="text-[#39FF14]" />
      ) : (
        <Square size={14} />
      )}
    </button>
  </td>
)}
```

### Step 9: Add Toolbar and Confirmation Dialog (At the end of the return statement, before closing tags)

```typescript
{/* Bulk Actions Toolbar */}
<BulkActionsToolbar
  selectedCount={selectedSymbols.size}
  onAction={handleBulkAction}
  onCancel={() => {
    setBulkMode(false);
    setSelectedSymbols(new Set());
  }}
/>

{/* Bulk Confirmation Dialog */}
<BulkConfirmationDialog
  isOpen={showBulkConfirmation}
  onClose={() => {
    setShowBulkConfirmation(false);
    setBulkActionConfig(null);
  }}
  onConfirm={executeBulkAction}
  symbols={Array.from(selectedSymbols)}
  action={bulkActionConfig || { type: 'priority', priority: 'medium' }}
  isProcessing={isBulkProcessing}
/>
```

### Step 10: Update Sticky Offsets for Checkbox Column

When bulkMode is active, adjust sticky column offsets:

```typescript
// In ScreenerRow component
const stickyOffsetSym = bulkMode 
  ? (visibleCols.has('rank') ? 132 : 84)  // Add 44px for checkbox
  : (visibleCols.has('rank') ? 88 : 40);
```

## Testing Checklist

- [ ] Bulk mode button toggles correctly
- [ ] Checkbox column appears/disappears with bulk mode
- [ ] Individual symbol selection works
- [ ] Select all / deselect all works
- [ ] Bulk actions toolbar appears with correct count
- [ ] Confirmation dialog shows correct preview
- [ ] API call succeeds and updates symbols
- [ ] Success/error toasts display correctly
- [ ] Mobile responsiveness works
- [ ] Sticky columns maintain proper positioning

## Notes

- The bulk API endpoint `/api/config/bulk` already exists and supports the `update` action
- All UI components follow existing design patterns
- Mobile responsiveness is built into the toolbar and dialog components
- The implementation uses existing state management patterns (useState, useCallback)
- Error handling follows existing toast notification patterns

## Future Enhancements

- Add intermediate dialogs for selecting priority/sound before confirmation
- Implement template selection UI
- Add undo functionality
- Add bulk enable/disable alerts action
- Add progress indicator for large bulk operations
