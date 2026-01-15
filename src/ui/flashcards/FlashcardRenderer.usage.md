# FlashcardRenderer Component Usage Guide

## Overview

The `FlashcardRenderer` component is responsible for rendering individual flashcards during review sessions. It supports multiple practice modes and provides a consistent interface for displaying flashcard content, including tables, images, code blocks, and other markdown elements.

## Task Implementation

**Task 33: Implement FlashcardRenderer for standard mode**

This component implements the standard flashcard practice mode where:
- The front (question/prompt) is always visible
- The back (answer/explanation) is revealed when the user is ready
- Optional hints can be displayed before revealing the answer
- All markdown content (including tables) is properly rendered

## Requirements Addressed

- **Requirement 3.3**: Display one flashcard at a time with question visible
- **Requirement 3.4**: Show back of flashcard with answer on reveal
- **Requirement 7.3**: Provide optional hint button
- **Requirement 7.5**: Preserve tables, images, and diagrams in flashcards

## Component API

### Props

```typescript
interface FlashcardRendererProps {
  /** The Obsidian App instance for markdown rendering */
  app: App;

  /** The flashcard to render */
  card: Flashcard;

  /** Whether the answer is revealed */
  revealed: boolean;

  /** Practice mode (currently only STANDARD is implemented) */
  practiceMode: PracticeMode;

  /** Callback when user submits an answer (for future practice modes) */
  onAnswerSubmit?: (answer: string) => void;

  /** Source file path for resolving relative links */
  sourcePath?: string;
}
```

## Usage Examples

### Basic Usage (Standard Mode)

```tsx
import FlashcardRenderer from './FlashcardRenderer';
import { PracticeMode } from '../../utils/types';

function ReviewSession() {
  const [revealed, setRevealed] = useState(false);

  return (
    <div>
      <FlashcardRenderer
        app={app}
        card={flashcard}
        revealed={revealed}
        practiceMode={PracticeMode.STANDARD}
        sourcePath="path/to/source.md"
      />
      {!revealed && (
        <button onClick={() => setRevealed(true)}>
          Reveal Answer
        </button>
      )}
    </div>
  );
}
```

### With Hint Support

```tsx
const flashcard = {
  id: 'card-123',
  front: 'What is the capital of France?',
  back: 'Paris',
  hint: 'Think of the Eiffel Tower',
  deckId: 'geography-deck',
  created: Date.now(),
  modified: Date.now(),
  tags: ['geography', 'europe'],
};

<FlashcardRenderer
  app={app}
  card={flashcard}
  revealed={revealed}
  practiceMode={PracticeMode.STANDARD}
/>
```

### With Tables

```tsx
const flashcard = {
  id: 'card-456',
  front: `Compare the following:

| Feature | React | Vue |
| --- | --- | --- |
| Creator | Facebook | Evan You |
| Type | Library | Framework |`,
  back: 'React is a library focused on UI, while Vue is a complete framework',
  deckId: 'web-dev-deck',
  created: Date.now(),
  modified: Date.now(),
  tags: ['javascript', 'frameworks'],
};

<FlashcardRenderer
  app={app}
  card={flashcard}
  revealed={revealed}
  practiceMode={PracticeMode.STANDARD}
/>
```

### With Images and Media

```tsx
const flashcard = {
  id: 'card-789',
  front: 'What structure is shown in this image?\n![Cell Structure](cell.png)',
  back: 'This is a plant cell with clearly visible chloroplasts',
  media: {
    images: ['cell.png'],
    diagrams: [],
  },
  deckId: 'biology-deck',
  created: Date.now(),
  modified: Date.now(),
  tags: ['biology', 'cells'],
};

<FlashcardRenderer
  app={app}
  card={flashcard}
  revealed={revealed}
  practiceMode={PracticeMode.STANDARD}
  sourcePath="Biology/Cell Structure.md"
/>
```

## Features

### Standard Mode (Implemented)

The standard mode provides the classic flashcard experience:

1. **Front Display**: The question/prompt is always visible
2. **Reveal Mechanism**: The answer is hidden until revealed
3. **Hint System**: Optional hints can be shown before revealing the answer
4. **Rich Content**: Supports tables, images, code blocks, math equations, and all markdown features

### Future Practice Modes (Planned)

The component is designed to support additional practice modes:

- **Type Answer Mode** (Task 34): Require typing the answer before revealing
- **Multiple Choice Mode** (Task 35): Generate distractors and present as multiple choice
- **Cloze Deletion Mode** (Task 36): Hide key terms and create fill-in-the-blank exercises

## Component Structure

```
flashcard-container-qg
├── flashcard-standard-mode-qg (or other mode class)
│   ├── flashcard-front-qg
│   │   ├── flashcard-front-label-qg ("Question")
│   │   └── flashcard-front-content-qg (TableRenderer)
│   ├── flashcard-hint-container-qg (if hint available and not revealed)
│   │   ├── flashcard-hint-button-qg (if not shown)
│   │   └── flashcard-hint-content-qg (if shown)
│   │       ├── flashcard-hint-label-qg ("Hint")
│   │       └── TableRenderer (hint content)
│   └── flashcard-back-qg (if revealed)
│       ├── flashcard-back-label-qg ("Answer")
│       └── flashcard-back-content-qg (TableRenderer)
```

## CSS Classes

All CSS classes follow the `-qg` suffix convention:

- `flashcard-container-qg`: Main container
- `flashcard-standard-mode-qg`: Standard mode container
- `flashcard-front-qg`: Front section wrapper
- `flashcard-front-label-qg`: "Question" label
- `flashcard-front-content-qg`: Front content container
- `flashcard-back-qg`: Back section wrapper
- `flashcard-back-label-qg`: "Answer" label
- `flashcard-back-content-qg`: Back content container
- `flashcard-hint-container-qg`: Hint section wrapper
- `flashcard-hint-button-qg`: "Show Hint" button
- `flashcard-hint-content-qg`: Hint content wrapper
- `flashcard-hint-label-qg`: "Hint" label
- `flashcard-not-implemented-qg`: Placeholder for future modes

## Data Attributes

The component provides data attributes for styling and testing:

- `data-practice-mode`: Current practice mode (e.g., "standard")
- `data-revealed`: Whether the answer is revealed (e.g., "true" or "false")

## Integration with Other Components

### TableRenderer

The FlashcardRenderer uses the `TableRenderer` component to render all markdown content:

```tsx
<TableRenderer
  app={app}
  content={card.front}
  context="flashcard"
  sourcePath={sourcePath}
/>
```

The `context="flashcard"` prop ensures proper CSS styling (`.flashcard-table-qg` class).

### FlashcardModal

The FlashcardRenderer is typically used within a `FlashcardModal` (Task 38):

```tsx
<FlashcardModal>
  <FlashcardRenderer
    app={app}
    card={currentCard}
    revealed={revealed}
    practiceMode={selectedMode}
  />
  {revealed && (
    <ConfidenceRating onRate={handleRating} />
  )}
  <ProgressDisplay current={currentIndex + 1} total={cards.length} />
</FlashcardModal>
```

## State Management

The component manages internal state for:

- `showHint`: Whether the hint is currently displayed (controlled by user clicking "Show Hint")

The parent component manages:

- `revealed`: Whether the answer is revealed
- Current card index
- Practice mode selection

## Accessibility

The component includes accessibility features:

- Semantic HTML structure with clear sections
- ARIA labels on interactive elements (hint button)
- Data attributes for screen readers and testing
- Keyboard navigation (handled by parent modal)

## Error Handling

The component handles various edge cases:

- Empty front/back content
- Missing hints (gracefully omitted)
- Malformed markdown (passed to MarkdownRenderer)
- Special characters and unicode
- Very long content

## Performance Considerations

- Uses React's conditional rendering to only render revealed content when needed
- Leverages Obsidian's optimized MarkdownRenderer
- Minimal re-renders by using proper state management
- Efficient handling of large content through virtual DOM

## Testing

Comprehensive tests are available in `FlashcardRenderer.test.ts`:

- Content rendering validation
- Reveal state management
- Hint display logic
- Props validation
- Requirements compliance
- Edge cases and error handling
- Accessibility features
- Security (XSS prevention)

## Best Practices

### DO

- ✅ Always provide the `app` instance for proper markdown rendering
- ✅ Use proper TypeScript types for flashcard data
- ✅ Include `sourcePath` when flashcards have relative links or images
- ✅ Reset `revealed` state when changing cards
- ✅ Handle keyboard shortcuts in parent component
- ✅ Test with various content types (tables, code, images)

### DON'T

- ❌ Don't manipulate flashcard data directly (use immutable updates)
- ❌ Don't skip the `revealed` prop (it controls answer visibility)
- ❌ Don't assume hints are always present (they're optional)
- ❌ Don't bypass TableRenderer for content rendering
- ❌ Don't forget to handle sourcePath for linked content

## Future Enhancements

The component is designed to be extended with additional practice modes:

1. **Type Answer Mode** (Task 34)
   - Add text input field
   - Implement answer comparison logic
   - Show similarity score

2. **Multiple Choice Mode** (Task 35)
   - Generate distractors from deck
   - Display randomized options
   - Highlight correct/incorrect answers

3. **Cloze Deletion Mode** (Task 36)
   - Detect and hide key terms
   - Create fill-in-the-blank inputs
   - Validate user input

## Related Components

- `TableRenderer`: Renders markdown content with table support
- `ConfidenceRating`: Collects user confidence ratings (Task 32)
- `ProgressDisplay`: Shows session progress (Task 31)
- `FlashcardModal`: Main modal container (Task 38)
- `PracticeModeSelector`: Selects practice mode (Task 37)

## Design Decisions

### Why TableRenderer for all content?

Using `TableRenderer` for all content (front, back, hint) ensures:
- Consistent rendering across all parts of the flashcard
- Automatic table detection and proper styling
- Support for all markdown features
- Minimal code duplication

### Why separate render functions?

Separate functions (`renderFront`, `renderBack`, `renderHint`) provide:
- Clear separation of concerns
- Easy testing of individual parts
- Flexibility for future enhancements
- Better code readability

### Why placeholders for future modes?

Including placeholder functions for future modes:
- Documents the roadmap
- Establishes the extension pattern
- Prevents breaking changes
- Helps developers understand the architecture

## Troubleshooting

### Tables not rendering properly

- Ensure `TableRenderer` is properly imported
- Check that the `context="flashcard"` prop is set
- Verify CSS styles for `.flashcard-table-qg` are loaded

### Images not displaying

- Include the `sourcePath` prop to resolve relative links
- Verify image paths are correct
- Check vault permissions for image access

### Hint button not appearing

- Verify the flashcard has a `hint` property
- Check that `revealed` is `false`
- Ensure the hint content is not empty

### Content not updating when card changes

- Reset `revealed` state when changing cards
- Reset `showHint` state (or use key prop)
- Ensure flashcard data is properly updated

## Version History

- **v1.0** (Task 33): Initial implementation with standard mode support
  - Front/back rendering
  - Hint system
  - Table support via TableRenderer
  - Comprehensive tests

## Contributing

When extending this component:

1. Follow the existing code patterns
2. Add comprehensive tests
3. Update this documentation
4. Maintain backward compatibility
5. Follow accessibility guidelines
6. Use the `-qg` suffix for all CSS classes
