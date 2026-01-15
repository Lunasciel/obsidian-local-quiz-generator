# ProgressDisplay Component Usage Guide

## Overview

The `ProgressDisplay` component provides visual feedback during flashcard review sessions. It displays the current card position, a visual progress bar, and session statistics to help users track their learning progress.

## Component Location

```
src/ui/flashcards/ProgressDisplay.tsx
```

## Requirements Addressed

- **Requirement 3.6**: Display session statistics during flashcard review
- **Requirement 6.3**: Show mastery progress indicators
- **Requirement 6.6**: Display success rate and study metrics

## Props

### ProgressDisplayProps

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `current` | `number` | Yes | Current card number (1-indexed for display) |
| `total` | `number` | Yes | Total number of cards in the review session |
| `stats` | `StudySession \| undefined` | No | Current study session statistics |

### StudySession Type

```typescript
interface StudySession {
  deckId: string;           // Deck being studied
  startTime: number;        // Session start timestamp
  endTime?: number;         // Session end timestamp (optional)
  cardsReviewed: number;    // Total cards reviewed
  newCards: number;         // Number of new cards introduced
  correctCount: number;     // Number of correct answers
  againCount: number;       // Number of cards marked "Again"
}
```

## Features

### 1. Card Position Display
- Shows current card number and total cards
- Format: "Card X of Y"
- Current card number highlighted with accent color
- Total shown in muted color for visual hierarchy

### 2. Visual Progress Bar
- Horizontal bar showing completion percentage
- Smooth animation when progress updates
- Uses Obsidian's interactive accent colors
- Accessible with proper ARIA attributes

### 3. Session Statistics (Optional)
- **Correct Count**: Number of cards answered correctly (green accent)
- **Again Count**: Number of cards marked for review (orange accent)
- **Reviewed Count**: Total cards reviewed in session (shown if > 0)

### 4. Accessibility
- Full keyboard navigation support
- ARIA labels for screen readers
- Progress bar has `role="progressbar"` with appropriate attributes
- High contrast mode support

### 5. Responsive Design
- Adapts to different screen sizes
- Mobile-friendly layout
- Statistics wrap on smaller screens

## Usage Examples

### Basic Usage (Card Position Only)

```tsx
import ProgressDisplay from '../ui/flashcards/ProgressDisplay';

// In your FlashcardModal component
<ProgressDisplay
  current={5}
  total={20}
/>
```

**Output**: Shows "Card 5 of 20" with a 25% filled progress bar.

### With Session Statistics

```tsx
import ProgressDisplay from '../ui/flashcards/ProgressDisplay';

const session: StudySession = {
  deckId: 'biology-101',
  startTime: Date.now(),
  cardsReviewed: 10,
  newCards: 3,
  correctCount: 8,
  againCount: 2,
};

<ProgressDisplay
  current={11}
  total={25}
  stats={session}
/>
```

**Output**: Shows card position, progress bar, and statistics:
- Correct: 8
- Again: 2
- Reviewed: 10

### Integration in FlashcardModal

```tsx
const FlashcardModal = () => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [sessionStats, setSessionStats] = useState<StudySession>({
    deckId: 'my-deck',
    startTime: Date.now(),
    cardsReviewed: 0,
    newCards: 0,
    correctCount: 0,
    againCount: 0,
  });

  const handleRating = (rating: ConfidenceRating) => {
    // Update statistics based on rating
    const newStats = { ...sessionStats };
    newStats.cardsReviewed += 1;

    if (rating === ConfidenceRating.AGAIN) {
      newStats.againCount += 1;
    } else {
      newStats.correctCount += 1;
    }

    setSessionStats(newStats);
    setCurrentIndex(currentIndex + 1);
  };

  return (
    <div className="modal-container">
      <FlashcardRenderer
        card={cards[currentIndex]}
        // ... other props
      />

      <ProgressDisplay
        current={currentIndex + 1}
        total={cards.length}
        stats={sessionStats}
      />

      <ConfidenceRating onRate={handleRating} />
    </div>
  );
};
```

## Styling

The component uses the following CSS classes (defined in `styles.css`):

### Main Container
- `.progress-display-qg` - Main container with flex layout

### Text Elements
- `.progress-text-qg` - Card position text container
- `.progress-current-qg` - Current card number (accent color)
- `.progress-separator-qg` - "of" separator (muted)
- `.progress-total-qg` - Total cards (muted)

### Progress Bar
- `.progress-bar-container-qg` - Bar container
- `.progress-bar-fill-qg` - Filled portion with gradient

### Statistics
- `.progress-stats-qg` - Statistics container
- `.progress-stat-item-qg` - Individual stat item
- `.progress-stat-label-qg` - Stat label (muted)
- `.progress-stat-value-qg` - Stat value
- `.progress-stat-correct-qg` - Correct count (green)
- `.progress-stat-again-qg` - Again count (orange)

## Customization

### Color Customization

The component respects Obsidian's theme variables:
- `--text-accent` - Current card number
- `--text-muted` - Total cards and labels
- `--interactive-accent` - Progress bar fill
- `--color-green` - Correct count
- `--color-orange` - Again count

### Size Customization

Adjust spacing via CSS variables:
```css
.progress-display-qg {
  --progress-padding: 1em;  /* Container padding */
  --progress-gap: 0.75em;   /* Gap between elements */
}
```

## Edge Cases Handled

1. **Zero total cards**: Progress bar shows 0%
2. **Single card deck**: Shows "Card 1 of 1" with 100% progress
3. **No statistics**: Statistics section hidden when `stats` is undefined
4. **Zero cards reviewed**: Reviewed count only shown when > 0
5. **Large numbers**: Handles thousands of cards efficiently
6. **Perfect session**: All correct (0 again) displays properly
7. **Challenging session**: Many again cards handled correctly

## Testing

Run the comprehensive test suite:

```bash
npm test src/ui/flashcards/ProgressDisplay.test.ts
```

**Test Coverage**: 29 test cases covering:
- Progress calculation (6 tests)
- Props validation (4 tests)
- Display text formatting (3 tests)
- Statistics display (4 tests)
- Edge cases (4 tests)
- Accessibility (2 tests)
- Component state transitions (2 tests)
- Integration with StudySession (2 tests)
- Performance metrics (2 tests)

## Accessibility Features

### Screen Readers
- Progress bar announced as "Progress: X of Y cards"
- Stat values clearly labeled
- Semantic HTML structure

### Keyboard Navigation
- No interactive elements (display-only component)
- Focusable elements in parent components

### Visual Accessibility
- High contrast mode support
- Color-blind friendly (uses text labels in addition to colors)
- Respects user's theme preferences
- Large touch targets on mobile

## Performance Considerations

- **Lightweight**: No complex calculations or DOM operations
- **Smooth animations**: CSS transitions for progress bar
- **Efficient rendering**: Pure component with minimal re-renders
- **No memory leaks**: No subscriptions or timers

## Related Components

- **FlashcardModal**: Main container that uses ProgressDisplay
- **ConfidenceRating**: Companion component for user input
- **FlashcardRenderer**: Displays the flashcard content
- **DeckSelector**: Shows deck-level progress statistics

## Future Enhancements

Potential improvements for future versions:
- Time remaining estimate
- Cards per minute metric
- Study streak indicator
- Animated transitions for milestones
- Customizable progress bar colors
- Audio feedback for progress milestones
