# ConfidenceRating Component

## Overview

The `ConfidenceRating` component provides a user interface for rating confidence levels when reviewing flashcards. It implements the SM-2 spaced repetition algorithm feedback mechanism with four rating levels: Again, Hard, Good, and Easy.

## Features

- Four confidence rating levels (Again, Hard, Good, Easy)
- Keyboard shortcuts (1-4) for quick rating selection
- Optional display of next review interval for each rating
- Accessible design with ARIA labels
- Color-coded buttons for visual distinction
- Responsive layout for mobile devices
- High contrast mode support

## Props

### `onRate: (rating: ConfidenceRating) => void`

**Required.** Callback function invoked when a user selects a confidence rating.

```tsx
const handleRating = (rating: ConfidenceRating) => {
  console.log('User selected rating:', rating);
  // Update flashcard metadata with the rating
};

<ConfidenceRating onRate={handleRating} />
```

### `intervals?: { again: number; hard: number; good: number; easy: number }`

**Optional.** Next review interval in days for each rating option. When provided, these intervals are displayed on the buttons.

```tsx
const intervals = {
  again: 0.1,   // < 1 day
  hard: 1,      // 1 day
  good: 5,      // 5 days
  easy: 10,     // 10 days
};

<ConfidenceRating onRate={handleRating} intervals={intervals} />
```

### `disabled?: boolean`

**Optional.** When `true`, disables all rating buttons and keyboard shortcuts. Default: `false`.

```tsx
<ConfidenceRating
  onRate={handleRating}
  disabled={isProcessing}
/>
```

## Usage Examples

### Basic Usage

```tsx
import ConfidenceRating from './ConfidenceRating';
import { ConfidenceRating as ConfidenceRatingEnum } from '../../utils/types';

const MyFlashcardReviewer = () => {
  const handleRating = (rating: ConfidenceRatingEnum) => {
    // Process the rating
    updateCardMetadata(currentCard.id, rating);
    moveToNextCard();
  };

  return (
    <div>
      <FlashcardDisplay card={currentCard} />
      <ConfidenceRating onRate={handleRating} />
    </div>
  );
};
```

### With Interval Display

```tsx
import ConfidenceRating from './ConfidenceRating';
import { ConfidenceRating as ConfidenceRatingEnum } from '../../utils/types';
import { calculateNextReview } from '../../services/flashcards/spacedRepetition';

const MyFlashcardReviewer = () => {
  const [intervals, setIntervals] = useState({
    again: 0.1,
    hard: 1,
    good: 5,
    easy: 10,
  });

  useEffect(() => {
    // Calculate intervals based on current card metadata
    const metadata = getCardMetadata(currentCard.id);
    const newIntervals = {
      again: calculateNextReview(metadata, ConfidenceRatingEnum.AGAIN).interval,
      hard: calculateNextReview(metadata, ConfidenceRatingEnum.HARD).interval,
      good: calculateNextReview(metadata, ConfidenceRatingEnum.GOOD).interval,
      easy: calculateNextReview(metadata, ConfidenceRatingEnum.EASY).interval,
    };
    setIntervals(newIntervals);
  }, [currentCard]);

  const handleRating = (rating: ConfidenceRatingEnum) => {
    updateCardMetadata(currentCard.id, rating);
    moveToNextCard();
  };

  return (
    <div>
      <FlashcardDisplay card={currentCard} />
      <ConfidenceRating
        onRate={handleRating}
        intervals={intervals}
      />
    </div>
  );
};
```

### With Loading State

```tsx
const MyFlashcardReviewer = () => {
  const [isSaving, setIsSaving] = useState(false);

  const handleRating = async (rating: ConfidenceRatingEnum) => {
    setIsSaving(true);
    try {
      await updateCardMetadata(currentCard.id, rating);
      await moveToNextCard();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <FlashcardDisplay card={currentCard} />
      <ConfidenceRating
        onRate={handleRating}
        disabled={isSaving}
      />
    </div>
  );
};
```

## Keyboard Shortcuts

The component automatically listens for keyboard events when enabled:

- **1** - Select "Again" rating
- **2** - Select "Hard" rating
- **3** - Select "Good" rating
- **4** - Select "Easy" rating

Keyboard shortcuts are disabled when the `disabled` prop is `true`.

## Rating Levels

### Again (0)

- **Meaning:** Completely forgot or answered incorrectly
- **Effect:** Card will be shown again within the same session
- **Typical interval:** < 1 day
- **Color:** Red (on hover)

### Hard (1)

- **Meaning:** Correct but required significant effort
- **Effect:** Minimal interval increase
- **Typical interval:** 1-2 days
- **Color:** Orange (on hover)

### Good (2)

- **Meaning:** Correct with some thought
- **Effect:** Moderate interval increase
- **Typical interval:** 3-10 days
- **Color:** Blue (on hover)

### Easy (3)

- **Meaning:** Instantly recalled
- **Effect:** Maximum interval increase
- **Typical interval:** 10+ days
- **Color:** Green (on hover)

## Interval Formatting

The component automatically formats intervals in a human-readable way:

- Less than 1 day: "< 1 day"
- Exactly 1 day: "1 day"
- 2-29 days: "X days"
- 30-364 days: "X months"
- 365+ days: "X years"

## Styling

The component uses the following CSS classes:

- `.confidence-rating-qg` - Container
- `.confidence-button-qg` - Individual button
- `.confidence-again-qg` - Again button
- `.confidence-hard-qg` - Hard button
- `.confidence-good-qg` - Good button
- `.confidence-easy-qg` - Easy button
- `.confidence-label-qg` - Button label text
- `.confidence-interval-qg` - Interval display text
- `.confidence-hotkey-qg` - Hotkey indicator

All styles follow Obsidian theme variables for consistency.

## Accessibility

### ARIA Labels

Each button includes descriptive ARIA labels:

- "Again - Show this card again in the same session"
- "Hard - Correct but with difficulty"
- "Good - Correct with some thought"
- "Easy - Instantly recalled"

### Focus Management

- All buttons support keyboard navigation with Tab
- Focus indicators are visible with `:focus-visible`
- Buttons are properly disabled when the component is disabled

### High Contrast Mode

The component supports high contrast mode via `@media (prefers-contrast: high)`:

- Increased border width
- Bold font weights for labels
- Enhanced hotkey indicator borders

## Responsive Design

The component adapts to smaller screens:

- On screens < 768px width:
  - Buttons stack with flexbox wrapping
  - Reduced padding and minimum width
  - Smaller font sizes

## Requirements Satisfied

This component satisfies the following requirements from the spec:

- **8.1:** Present confidence rating options (Again, Hard, Good, Easy)
- **8.2:** "Again" shows card again within same session
- **8.3:** "Hard" schedules with minimal interval increase
- **8.4:** "Good" schedules with moderate interval increase
- **8.5:** "Easy" schedules with maximum interval increase
- **8.6:** Prioritize "Again"/"Hard" cards in future sessions
- **8.7:** Cycle through cards before showing same card again

## Testing

Comprehensive unit tests are provided in `ConfidenceRating.test.ts`:

- Interval formatting logic
- Keyboard shortcut handling
- Requirements compliance
- Accessibility features
- Edge cases and error handling
- Performance
- Security

Run tests with:

```bash
npm test -- ConfidenceRating.test.ts
```

## Integration Example

Complete integration with FlashcardModal:

```tsx
import FlashcardModal from './FlashcardModal';
import ConfidenceRating from './ConfidenceRating';
import { ConfidenceRating as ConfidenceRatingEnum } from '../../utils/types';

const FlashcardModal = ({ deck, cards, metadata }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const currentCard = cards[currentIndex];
  const currentMetadata = metadata.get(currentCard.id);

  const intervals = useMemo(() => {
    if (!revealed || !currentMetadata) return undefined;

    return {
      again: calculateInterval(currentMetadata, ConfidenceRatingEnum.AGAIN),
      hard: calculateInterval(currentMetadata, ConfidenceRatingEnum.HARD),
      good: calculateInterval(currentMetadata, ConfidenceRatingEnum.GOOD),
      easy: calculateInterval(currentMetadata, ConfidenceRatingEnum.EASY),
    };
  }, [revealed, currentMetadata]);

  const handleRating = async (rating: ConfidenceRatingEnum) => {
    await recordReview(currentCard.id, rating);
    setRevealed(false);
    setCurrentIndex(prev => prev + 1);
  };

  return (
    <div className="flashcard-modal-qg">
      <FlashcardRenderer
        card={currentCard}
        revealed={revealed}
        onReveal={() => setRevealed(true)}
      />

      {revealed && (
        <ConfidenceRating
          onRate={handleRating}
          intervals={intervals}
        />
      )}
    </div>
  );
};
```

## Performance Considerations

- Interval formatting is optimized for repeated calls
- Keyboard event listeners are properly cleaned up
- Component re-renders are minimized with proper prop dependencies
- No unnecessary computations in render cycle

## Browser Compatibility

The component uses standard web APIs:

- React hooks (useEffect)
- addEventListener/removeEventListener
- Modern CSS (flexbox, CSS variables)

All features are supported in modern browsers and Obsidian's Electron environment.
