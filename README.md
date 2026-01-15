# Quiz Generator

[![GitHub Downloads](https://img.shields.io/github/downloads/ECuiDev/obsidian-quiz-generator/total?labelColor=21262d&color=238636&logo=github&style=for-the-badge)](https://github.com/ECuiDev/obsidian-quiz-generator/releases) [![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?labelColor=21262d&color=%23483699&label=downloads&query=%24%5B%22quiz-generator%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json&logo=obsidian&style=for-the-badge)](https://github.com/ECuiDev/obsidian-quiz-generator/releases) [![Release](https://img.shields.io/github/v/release/ECuiDev/obsidian-quiz-generator?display_name=tag&labelColor=21262d&color=1f6feb&style=for-the-badge)](https://github.com/ECuiDev/obsidian-quiz-generator/releases/latest)

**Quiz Generator** is a plugin for [Obsidian](https://obsidian.md/) that leverages the power of various AI models to generate interactive, exam-style questions from your notes. Whether you're a student preparing for exams or an educator designing assessments, this plugin streamlines the question creation process.

## Demo

https://github.com/user-attachments/assets/22770da4-af69-412c-ae05-1aae0fff4a10

## Features

### Quiz System
- **Personalized Quizzes:** Choose any combination of notes and folders to use as the quiz content.
- **Flexible Generation:** Select the types and number of questions to generate according to your needs.
- **Multiple Question Types:** Supports true or false, multiple choice, select all that apply, fill in the blank, matching, short answer, and long answer. Mix and match for a tailored assessment experience.
- **Custom Quiz UI:** Answer questions in an interactive UI that provides real-time feedback on your responses.
- **Question Saving:** Save questions in various formats.
  - Inline and multiline flashcards compatible with [obsidian-spaced-repetition](https://github.com/st3v3nmw/obsidian-spaced-repetition).
  - Markdown callouts for easy integration into your notes.
- **Review and Create:** Review saved questions using the quiz UI or create your own questions from scratch without ever using the generator.

### Flashcard System
- **AI-Powered Flashcard Generation:** Automatically create flashcards from your notes using OpenAI or Ollama.
- **Spaced Repetition:** Built-in SM-2 algorithm optimizes review scheduling for better long-term retention.
- **Multiple Practice Modes:**
  - Standard (classic flashcard)
  - Type Answer (active recall through typing)
  - Multiple Choice (recognition-based learning)
  - Cloze Deletion (fill-in-the-blank)
- **Progressive Mastery Tracking:** Track cards from "New" → "Learning" → "Mastered" status.
- **Deck Management:** Organize flashcards by topic, note, or folder with detailed statistics.
- **Confidence-Based Scheduling:** Rate cards as Again, Hard, Good, or Easy to personalize review intervals.
- **Customizable Settings:** Fine-tune spaced repetition parameters, intervals, and practice modes.
- **Keyboard Shortcuts:** Fully customizable keyboard shortcuts for efficient review sessions.

### LLM Council (Advanced Generation)
- **Multi-Model Debate:** Multiple AI models (minimum 2, up to 10) collaborate through a structured debate process to generate higher-quality quizzes.
- **Anonymous Critique:** Models anonymously evaluate each other's outputs, identifying strengths, weaknesses, and errors without bias.
- **Consensus Ranking:** Responses are ranked using the Borda count voting algorithm to democratically identify the best content.
- **Chair Synthesis:** A designated chair model synthesizes the best elements from all responses into a final, high-quality quiz.
- **Full Transparency:** View the complete debate trail showing all responses, critiques, rankings, and synthesis decisions.
- **Cost Tracking:** Monitor token usage and estimated costs across all phases (parallel query, critique, ranking, synthesis).
- **Smart Caching:** Cache council results to avoid redundant API calls for identical inputs and settings.
- **Flexible Configuration:** Choose which models participate, configure the chair selection strategy (highest-ranked, configured, rotating), and customize phase timeouts.
- **Graceful Fallback:** Automatically falls back to single-model generation if the council process encounters errors.

See the [LLM Council Guide](docs/COUNCIL.md) for detailed documentation and examples.

### Rich Content Support
- **Table Rendering:** Properly rendered markdown tables in both quizzes and flashcards with horizontal scrolling for wide tables.
- **Math Support:** LaTeX formulas and equations fully supported.
- **Code Blocks:** Syntax-highlighted code in questions, answers, and flashcards.
- **Images and Diagrams:** Embed images and visual content in both quizzes and flashcards.
- **Multi-Language Support:** Generate content in 22 different languages.

## Supported Providers

- [Ollama](https://ollama.com/): Local LLMs for enhanced privacy and offline processing.
- [LM Studio](https://lmstudio.ai/): Run models locally via OpenAI-compatible API for private, offline question and flashcard generation.

## Usage

### Installation

This plugin is now available in the **Community plugins** page in Obsidian. You can install it using either of the following methods.

#### Obsidian Installation

1. Install the plugin from the **Community plugins** page in Obsidian.
   - **Settings** → **Community plugins** → **Browse**.
   - Search for `Quiz Generator`.
   - Select the plugin to open its page and then select **Install**.
   - Select **Enable** on the plugin page or go back to the **Community plugins** page and toggle the switch.
2. Configure your local LLM provider:
   - **For Ollama**: Install [Ollama](https://ollama.com/) and pull a model (e.g., `ollama pull llama2`). The plugin will connect to Ollama running on your local machine.
   - **For LM Studio**: Install [LM Studio](https://lmstudio.ai/), download a model, start the local server, and configure the base URL in the plugin settings (typically `http://localhost:1234/v1`).
3. Configure the other settings as desired.

#### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/ECuiDev/obsidian-quiz-generator/releases).
2. Go to your Obsidian vault's `plugins` folder and create a new folder named `quiz-generator`.
3. Move the files you downloaded in step 1 to this folder.
4. Enable the plugin in the **Community plugins** page in Obsidian.
5. Configure your local LLM provider:
   - **For Ollama**: Install [Ollama](https://ollama.com/) and pull a model (e.g., `ollama pull llama2`). The plugin will connect to Ollama running on your local machine.
   - **For LM Studio**: Install [LM Studio](https://lmstudio.ai/), download a model, start the local server, and configure the base URL in the plugin settings (typically `http://localhost:1234/v1`).
6. Configure the other settings as desired.

### Generation

- Open the command palette and select "Quiz Generator: Open generator" or select the [brain-circuit](https://lucide.dev/icons/brain-circuit) icon in the left sidebar.
- Select the [file](https://lucide.dev/icons/file-plus-2) and [folder](https://lucide.dev/icons/folder-plus) icons to add notes and folders.
  - Adding a folder adds all the notes inside it, as well as any notes in its subfolders (can be changed in the settings). If you select an extremely large folder (thousands of files and hundreds of subfolders), it could take a few seconds for it to be added.
- Select the [eye](https://lucide.dev/icons/eye) icon to view the contents of selected notes and folders.
- Select the [x](https://lucide.dev/icons/x) icon to remove individual notes or folders and the [book](https://lucide.dev/icons/book-x) icon to remove everything.
- Once you've added your notes and/or folders, select the [webhook](https://lucide.dev/icons/webhook) icon to generate the questions.
  - The quiz UI will open automatically when the generation is complete.

### Saving

- Saved questions will be in a Markdown file named "Quiz [number]" in the folder specified by the "Save location" setting.
- Select the [save](https://lucide.dev/icons/save) icon to save the current question.
- Select the [save-all](https://lucide.dev/icons/save-all) icon to save all questions.

### Reviewing Saved Quizzes

- Open the command palette and select "Quiz Generator: Open quiz from active note" or right-click a note in the file explorer and select "Open quiz from this note" in the file menu.

### Working with Flashcards

#### Generating Flashcards

1. **From Active Note**:
   - Command palette: "Quiz Generator: Generate flashcards from active note"
   - Or use the generator UI and switch to flashcard mode

2. **Configure and Generate**:
   - Choose number of flashcards
   - Select LLM provider (OpenAI or Ollama)
   - Click generate
   - Review generated flashcards immediately

3. **Save Flashcards**:
   - Save individual flashcards or all at once
   - Choose between Callout or Spaced Repetition format in settings
   - Flashcards are automatically added to a deck

#### Reviewing Flashcards

1. **Start a Review Session**:
   - Quick actions in settings: **Settings** → **Quiz Generator** → **Flashcards** → Click "Review flashcards" button
   - Command palette: "Quiz Generator: Review flashcards"
   - Or click the flashcard icon in the ribbon

2. **Select a Deck**:
   - View deck statistics (new, learning, mastered, due today)
   - Select one or more decks to study
   - Choose your preferred practice mode

3. **Practice and Rate**:
   - Review cards using your chosen practice mode
   - Rate your confidence: Again (1), Hard (2), Good (3), Easy (4)
   - Use keyboard shortcuts for faster review
   - Track session progress and statistics

#### Managing Decks

Access deck management through:
- Quick actions in settings: **Settings** → **Quiz Generator** → **Flashcards** → Click "Manage decks" button
- Command palette: "Quiz Generator: Manage flashcard decks"

Features:
- View all decks with detailed statistics
- Create new decks manually
- Configure deck-specific settings (new cards per day, practice modes, etc.)
- Delete decks (with option to keep or remove cards)

#### Viewing Statistics

Track your flashcard progress and performance:
- Quick actions in settings: **Settings** → **Quiz Generator** → **Flashcards** → Click "View statistics" button
- View overall progress, mastery levels, and review history
- Filter by deck to see specific statistics
- Start a review session directly from statistics view

For a comprehensive guide to the flashcard system, see [docs/FLASHCARDS.md](docs/FLASHCARDS.md).

### Using LLM Council Mode

The LLM Council feature enables multiple AI models to collaborate through a structured debate process, resulting in higher-quality quiz content. This is ideal for high-stakes assessments, complex subject matter, or when accuracy is paramount.

1. **Enable Council Mode**:
   - **Settings** → **Quiz Generator** → **LLM Council**
   - Toggle "Enable Council Mode"

2. **Configure Council Members**:
   - Select at least 2 models to participate (up to 10 models supported)
   - Each model requires valid API credentials
   - Each model contributes unique perspectives and reasoning
   - More models = more diverse insights and better quality (but higher cost and longer generation time)

3. **Select Chair Strategy**:
   - **Highest-Ranked**: Automatically uses the best-performing model (recommended)
   - **Configured**: Always use a specific model you trust
   - **Rotating**: Distribute load across models in round-robin fashion

4. **Generate with Council**:
   - Open the generator and add your notes/folders
   - The council mode toggle appears alongside quiz/flashcard modes
   - Click generate and watch progress through all five phases:
     - Phase 1: Parallel Query (all models generate independently)
     - Phase 2: Anonymous Critique (models evaluate each other)
     - Phase 3: Ranking (responses ranked by consensus)
     - Phase 4: Chair Synthesis (chair creates final quiz)
     - Phase 5: Finalization (build audit trail)

5. **Review the Debate Trail** (optional):
   - View all initial responses from each model
   - See critiques identifying strengths, weaknesses, and errors
   - Examine consensus rankings and Borda count scores
   - Understand which elements were incorporated into the final quiz
   - Review detailed token usage breakdown by phase (parallel query, critique, ranking, synthesis)
   - Monitor per-model token consumption and total estimated cost

**When to Use Council Mode:**
- ✅ High-stakes quizzes (exams, certifications)
- ✅ Complex subject matter requiring multiple perspectives
- ✅ When accuracy is more important than speed/cost
- ✅ Quality validation for educational content
- ✅ When you need transparency into the generation process

**When NOT to Use Council Mode:**
- ❌ Quick practice quizzes for personal study
- ❌ Simple, straightforward content
- ❌ Budget-constrained scenarios (higher token usage)
- ❌ Real-time generation requirements (slower due to multiple phases)

**Additional Configuration Options:**
- Enable/disable critique and ranking phases independently
- Set minimum models required (default: 2)
- Configure phase-specific timeouts (parallel query, critique, ranking, synthesis)
- Enable caching to reuse results for identical inputs
- Toggle fallback to single-model generation on errors
- Control debate trail visibility and storage

For detailed configuration options, usage examples, and best practices, see the [LLM Council Guide](docs/COUNCIL.md).

### Miscellaneous

- Select the [scroll](https://lucide.dev/icons/scroll-text) icon in the generator UI to re-open the most recently generated quiz.

### Manually Creating or Modifying Questions

If you want to write your own questions from scratch or modify any saved questions, they must follow the format below to be opened in the quiz UI. However, deviations in spacing and capitalization are okay (the parser is case-insensitive and ignores whitespace).

Text enclosed by {curly braces} is required but can be anything. Text enclosed by &lt;angle brackets&gt; is optional and can be anything. Any other text (not enclosed by either) should be written as shown. You are allowed to make any of the callouts foldable by adding a plus (+) or minus (-). For spaced repetition, you are allowed to bold or italicize the question type identifier using any combination of asterisks and underscores.

#### True or False Format

**Callout**
```
> [!question] {Insert your question here}
>> [!success] <Answer>
>> One of true or false

> [!question] HTML is a programming language.
>> [!success]- Answer
>> False
```

**Spaced Repetition**
```
True or False: {Insert your question here} Insert inline separator you chose in the settings One of true or false

True or False: HTML is a programming language. :: False
```

#### Multiple Choice Format

Supports up to 26 choices, denoted by the 26 letters of the English alphabet. You should use the letters in alphabetical order starting from "a". The example below uses 4 choices.

**Callout**
```
> [!question] {Insert your question here}
> a) {Choice 1}
> b) {Choice 2}
> c) {Choice 3}
> d) {Choice 4}
>> [!success] <Answer>
>> One of a), b), c), etc. <text of the correct choice>

> [!question] Which of the following is the correct translation of house in Spanish?
> a) Casa
> b) Maison
> c) Haus
> d) Huis
>> [!success]- Answer
>> a) Casa
```

**Spaced Repetition**
```
Multiple Choice: {Insert your question here}
a) {Choice 1}
b) {Choice 2}
c) {Choice 3}
d) {Choice 4}
Insert multiline separator you chose in the settings
One of a), b), c), etc. <text of the correct choice>

Multiple Choice: Which of the following is the correct translation of house in Spanish?
a) Casa
b) Maison
c) Haus
d) Huis
?
a) Casa
```

#### Select All That Apply Format

Supports up to 26 choices, denoted by the 26 letters of the English alphabet. There must be at least 2 correct answers or this will be treated as a multiple choice question by the quiz UI. You should use the letters in alphabetical order starting from "a". The example below uses 5 choices.

**Callout**
```
> [!question] {Insert your question here}
> a) {Choice 1}
> b) {Choice 2}
> c) {Choice 3}
> d) {Choice 4}
> e) {Choice 5}
>> [!success] <Answer>
>> One of a), b), c), etc. <text of the correct choice>
>> One of a), b), c), etc. <text of the correct choice>

> [!question] Which of the following are elements on the periodic table?
> a) Oxygen
> b) Water
> c) Hydrogen
> d) Salt
> e) Carbon
>> [!success]- Answer
>> a) Oxygen
>> c) Hydrogen
>> e) Carbon
```

**Spaced Repetition**
```
Select All That Apply: {Insert your question here}
a) {Choice 1}
b) {Choice 2}
c) {Choice 3}
d) {Choice 4}
e) {Choice 5}
Insert multiline separator you chose in the settings
One of a), b), c), etc. <text of the correct choice>
One of a), b), c), etc. <text of the correct choice>

Select All That Apply: Which of the following are elements on the periodic table?
a) Oxygen
b) Water
c) Hydrogen
d) Salt
e) Carbon
?
a) Oxygen
c) Hydrogen
e) Carbon
```

#### Fill in the Blank Format

Supports an infinite number of blanks. The question must contain at least 1 blank, represented as one or more underscores enclosed by backticks. The answer(s) should appear in the same order as the blank(s) they correspond to. So the first answer corresponds to the first blank, the second answer to the second blank, and so on.

The answer(s) to the blank(s) must be separated by commas with at least 1 space after the comma. This spacing condition exists because it allows the parser to recognize the entirety of a large number as a single answer (since numbers greater than 3 digits typically have commas).

**Callout**
```
> [!question] {Insert your question here}
>> [!success] <Answer>
>> Comma separated list of answer(s)

> [!question] The Battle of `____` was fought in `____`.
>> [!success]- Answer
>> Gettysburg, 1863
```

**Spaced Repetition**
```
Fill in the Blank: {Insert your question here} Insert inline separator you chose in the settings Comma separated list of answer(s)

Fill in the Blank: The Battle of `____` was fought in `____`. :: Gettysburg, 1863
```

#### Matching Format

Supports up to 13 pairs (i.e. 26 choices total, 13 on each "side"). The first group should use letters a to m and the second group should use letters n to z. Both groups should use the letters in alphabetical order. The answer to a pair is represented as a letter from the first group followed by a letter from the second group, separated by an arrow (one or more hyphens followed by a right angle bracket). The letter from the first group must come first, but you may list the pairs in any order. The example below uses 4 pairs.

**Callout**
```
> [!question] {Insert your question here}
>> [!example] <Group A>
>> a) {Choice 1}
>> b) {Choice 2}
>> c) {Choice 3}
>> d) {Choice 4}
>
>> [!example] <Group B>
>> n) {Choice 5}
>> o) {Choice 6}
>> p) {Choice 7}
>> q) {Choice 8}
>
>> [!success] <Answer>
>> One of a), b), c), etc. -> One of n), o), p), etc.
>> One of a), b), c), etc. -> One of n), o), p), etc.
>> One of a), b), c), etc. -> One of n), o), p), etc.
>> One of a), b), c), etc. -> One of n), o), p), etc.

> [!question] Match the medical term to its definition.
>> [!example] Group A
>> a) Hypertension
>> b) Bradycardia
>> c) Tachycardia
>> d) Hypotension
>
>> [!example] <Group B>
>> n) Fast heart rate
>> o) High blood pressure
>> p) Low blood pressure
>> q) Slow heart rate
>
>> [!success]- Answer
>> a) -> o)
>> b) -> q)
>> c) -> n)
>> d) -> p)
```

**Spaced Repetition**
```
Matching: {Insert your question here}
{Group A}
a) {Choice 1}
b) {Choice 2}
c) {Choice 3}
d) {Choice 4}
{Group B}
n) {Choice 5}
o) {Choice 6}
p) {Choice 7}
q) {Choice 8}
Insert multiline separator you chose in the settings
One of a), b), c), etc. -> One of n), o), p), etc.
One of a), b), c), etc. -> One of n), o), p), etc.
One of a), b), c), etc. -> One of n), o), p), etc.
One of a), b), c), etc. -> One of n), o), p), etc.

Matching: Match the medical term to its definition.
Group A
a) Hypertension
b) Bradycardia
c) Tachycardia
d) Hypotension
Group B
n) Fast heart rate
o) High blood pressure
p) Low blood pressure
q) Slow heart rate
?
a) -> o)
b) -> q)
c) -> n)
d) -> p)
```

#### Short Answer Format

**Callout**
```
> [!question] {Insert your question here}
>> [!success] <Answer>
>> {Insert answer here}

> [!question] Who was the first President of the United States and what is he commonly known for?
>> [!success]- Answer
>> George Washington was the first President of the United States and is commonly known for leading the American Revolutionary War and serving two terms as president.
```

**Spaced Repetition**
```
Short Answer: {Insert your question here} Insert inline separator you chose in the settings {Insert answer here}

Short Answer: Who was the first President of the United States and what is he commonly known for? :: George Washington was the first President of the United States and is commonly known for leading the American Revolutionary War and serving two terms as president.
```

#### Long Answer Format

**Callout**
```
> [!question] {Insert your question here}
>> [!success] <Answer>
>> {Insert answer here}

> [!question] Explain the difference between a stock and a bond, and discuss the risks and potential rewards associated with each investment type.
>> [!success]- Answer
>> A stock represents ownership in a company and a claim on part of its profits. The potential rewards include dividends and capital gains if the company's value increases, but the risks include the possibility of losing the entire investment if the company fails. A bond is a loan made to a company or government, which pays interest over time and returns the principal at maturity. Bonds are generally considered less risky than stocks, as they provide regular interest payments and the return of principal, but they offer lower potential returns.
```

**Spaced Repetition**
```
Long Answer: {Insert your question here} Insert inline separator you chose in the settings {Insert answer here}

Long Answer: Explain the difference between a stock and a bond, and discuss the risks and potential rewards associated with each investment type. :: A stock represents ownership in a company and a claim on part of its profits. The potential rewards include dividends and capital gains if the company's value increases, but the risks include the possibility of losing the entire investment if the company fails. A bond is a loan made to a company or government, which pays interest over time and returns the principal at maturity. Bonds are generally considered less risky than stocks, as they provide regular interest payments and the return of principal, but they offer lower potential returns.
```

### Flashcard Formats

Flashcards can be saved in two formats, both supporting rich markdown content including tables, code blocks, images, and LaTeX.

#### Callout Format

Obsidian-style callouts with front (question), back (answer), and optional hint:

```markdown
> [!flashcard] What is the capital of France?
>> [!answer]-
>> Paris
>>
>> [!hint]- (optional)
>> Think of the Eiffel Tower
```

**Example with Table:**

```markdown
> [!flashcard] What are the primary colors and their wavelengths?
>> [!answer]-
>> | Color | Wavelength |
>> | ----- | ---------- |
>> | Red   | ~700 nm    |
>> | Green | ~550 nm    |
>> | Blue  | ~450 nm    |
```

#### Spaced Repetition Format

Inline format compatible with obsidian-spaced-repetition plugin:

```markdown
**Flashcard:** What is the capital of France? :: Paris
```

**Example with Code:**

```markdown
**Flashcard:** What does this Python function calculate?
\`\`\`python
def factorial(n):
    return 1 if n <= 1 else n * factorial(n-1)
\`\`\`
:: It calculates the factorial of a number using recursion
```

You can switch between formats in Settings → Quiz Generator → Flashcards → Flashcard save format.

### Table Support

Both quizzes and flashcards fully support markdown tables with automatic horizontal scrolling for wide tables.

**Example Quiz Question with Table:**

```markdown
> [!question] Based on the table below, which element has the highest atomic mass?
> | Element | Symbol | Atomic Mass |
> | ------- | ------ | ----------- |
> | Oxygen  | O      | 15.999      |
> | Carbon  | C      | 12.011      |
> | Nitrogen| N      | 14.007      |
>> [!success]- Answer
>> Oxygen
```

**Example Flashcard with Table:**

```markdown
> [!flashcard] What are the Git commands for basic version control?
>> [!answer]-
>> | Command | Purpose |
>> | ------- | ------- |
>> | git add | Stage changes |
>> | git commit | Save changes |
>> | git push | Upload to remote |
>> | git pull | Download from remote |
```

Tables work seamlessly in:
- All quiz question types
- All flashcard practice modes
- Both callout and spaced repetition formats
- Questions, answers, hints, and options

## Coming Soon

I'm actively working on bringing more features and improvements to Quiz Generator. Stay tuned for the following updates:

### Next Release

- **Feature Requests:** [#16](https://github.com/ECuiDev/obsidian-quiz-generator/issues/16), [#17](https://github.com/ECuiDev/obsidian-quiz-generator/issues/17), [#21](https://github.com/ECuiDev/obsidian-quiz-generator/issues/21), [#22](https://github.com/ECuiDev/obsidian-quiz-generator/issues/22).
- **Chunking:** Automatically break down long notes into smaller segments. Intended to fix [#19](https://github.com/ECuiDev/obsidian-quiz-generator/issues/19) and [#20](https://github.com/ECuiDev/obsidian-quiz-generator/issues/20).
- **Note Links:** Adding a note also adds outgoing links and backlinks.

### Future Releases

- **Randomize Choices:** Randomize choice order for multiple choice and select all that apply questions are displayed.
- **New Question Type:** Categorization.
- **Test Mode:** Take quizzes with a time limit and receive a score at the end.
- **Homepage:** Access all your quizzes from a custom homepage UI.
- **Spaced Repetition:** Use the quiz UI with spaced repetition to review quizzes.
- **Faster Question Creation:** Custom UI to streamline creating your own questions from scratch.
- **Extended Files:** Generate questions from PDFs and images.
- **Advanced Question Type:** Image-based.
- **Question Variety:** Customization options to control the question scope and what it assesses.
- **Quality of Life:** Reducing token usage while improving question quality.
- **Tag Adder:** Add notes by tag.
- **Custom View:** Embed the quiz UI directly inside your notes.
- **Dataview Adder:** Add notes using [Dataview](https://github.com/blacksmithgu/obsidian-dataview) queries.
- **Save Format Conversion Tool:** Convert saved questions between callout and spaced repetition format.
- **Adjustable Difficulty:** Set the difficulty of generated questions.
- **Advanced Generation:** Control the number of choices, blanks, and pairs to generate.
- **Responsive UI:** Freely resize and move the UI.

## Issues and Feature Requests

If you encounter any errors or have feature requests, please open an issue on the [GitHub repository](https://github.com/ECuiDev/obsidian-quiz-generator/issues).

## Tips

- Button Border Meanings
  - Solid Green Border: Correct option you selected.
  - Solid Red Border: Incorrect option you selected.
  - Dashed Green Border: Correct option you didn't select.
- Matching Question UI Breakdown
  - To create a pair, select a button from either column and then select a button from the other column. The UI will connect the buttons by displaying the same number in their respective circles.
    - If you select an unpaired button and then select a paired button from the other column, the pair will update to match the new selection.
  - To remove a pair, double-click on the paired button (either left or right).
