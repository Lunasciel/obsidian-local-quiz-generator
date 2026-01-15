import { App } from "obsidian";
import { useState, useEffect } from "react";
import { Flashcard, PracticeMode } from "../../utils/types";
import TableRenderer from "../components/TableRenderer";
import { compareAnswers } from "../../utils/rendering";

/**
 * Props for the FlashcardRenderer component
 */
interface FlashcardRendererProps {
	/**
	 * The Obsidian App instance for markdown rendering
	 */
	app: App;

	/**
	 * The flashcard to render
	 */
	card: Flashcard;

	/**
	 * Whether the answer is revealed
	 */
	revealed: boolean;

	/**
	 * Practice mode (currently only STANDARD is implemented)
	 */
	practiceMode: PracticeMode;

	/**
	 * Callback when user submits an answer (for future practice modes)
	 */
	onAnswerSubmit?: (answer: string) => void;

	/**
	 * Source file path for resolving relative links
	 */
	sourcePath?: string;

	/**
	 * All cards in the deck (needed for multiple-choice distractor generation)
	 */
	deckCards?: Flashcard[];

	/**
	 * Callback when user toggles flag on the card
	 */
	onFlagToggle?: (cardId: string) => void;
}

/**
 * FlashcardRenderer Component
 *
 * Renders flashcard content with support for different practice modes.
 * This component displays the front of the flashcard (question/prompt) and
 * optionally reveals the back (answer/explanation) when the user is ready.
 *
 * Features:
 * - Standard mode: Show front, reveal back on button click
 * - Table support: Uses TableRenderer for rendering content with tables
 * - Hint display: Shows optional hints when available
 * - Media support: Renders images and diagrams in flashcard content
 * - Keyboard shortcuts: Space to reveal (handled by parent component)
 *
 * Currently implemented modes:
 * - STANDARD: Traditional flashcard flip (front → back)
 *
 * Future modes (to be implemented in tasks 34-36):
 * - TYPE_ANSWER: Type answer before revealing
 * - MULTIPLE_CHOICE: Select from multiple options
 * - CLOZE: Fill in the blanks
 *
 * Requirements addressed:
 * - Requirement 3.3: Display one flashcard at a time with question visible
 * - Requirement 3.4: Show back of flashcard with answer on reveal
 * - Requirement 7.3: Provide optional hint button
 * - Requirement 7.5: Preserve tables, images, and diagrams in flashcards
 *
 * Usage:
 * ```tsx
 * <FlashcardRenderer
 *   app={app}
 *   card={flashcard}
 *   revealed={isRevealed}
 *   practiceMode={PracticeMode.STANDARD}
 *   sourcePath="path/to/source.md"
 * />
 * ```
 *
 * @param props - The component props
 * @returns A rendered flashcard element
 */
const FlashcardRenderer = ({
	app,
	card,
	revealed,
	practiceMode,
	onAnswerSubmit,
	sourcePath = "",
	deckCards = [],
	onFlagToggle
}: FlashcardRendererProps) => {
	const [showHint, setShowHint] = useState(false);
	const [userAnswer, setUserAnswer] = useState("");
	const [answerSubmitted, setAnswerSubmitted] = useState(false);
	const [comparisonResult, setComparisonResult] = useState<{
		similarity: number;
		isCorrect: boolean;
		feedback: string;
	} | null>(null);

	// State for multiple-choice mode
	const [mcOptions, setMcOptions] = useState<string[]>([]);
	const [mcSelectedIndex, setMcSelectedIndex] = useState<number | null>(null);
	const [mcCorrectIndex, setMcCorrectIndex] = useState<number>(-1);
	const [mcSubmitted, setMcSubmitted] = useState(false);

	// State for cloze-deletion mode
	const [clozeTerms, setClozeTerms] = useState<string[]>([]);
	const [clozeUserInputs, setClozeUserInputs] = useState<string[]>([]);
	const [clozeSubmitted, setClozeSubmitted] = useState(false);
	const [clozeResults, setClozeResults] = useState<boolean[]>([]);

	/**
	 * Generates distractor options for multiple-choice mode
	 * Selects related terms from other cards in the deck
	 */
	const generateDistractors = (
		correctAnswer: string,
		allCards: Flashcard[],
		count: number = 3
	): string[] => {
		// Filter out the current card and get potential distractors
		const otherCards = allCards.filter((c) => c.id !== card.id);

		if (otherCards.length === 0) {
			// No other cards available, generate placeholder distractors
			return [
				"Option A",
				"Option B",
				"Option C"
			].slice(0, count);
		}

		// Extract answers from other cards as potential distractors
		const potentialDistractors = otherCards.map((c) => c.back);

		// Shuffle and select random distractors
		const shuffled = [...potentialDistractors].sort(() => Math.random() - 0.5);
		const selected = shuffled.slice(0, count);

		// If we don't have enough distractors, add generic ones
		while (selected.length < count) {
			selected.push(`Option ${String.fromCharCode(65 + selected.length)}`);
		}

		return selected;
	};

	/**
	 * Initializes multiple-choice options when card changes
	 */
	const initializeMultipleChoice = (allCards: Flashcard[]) => {
		// Generate distractors
		const distractors = generateDistractors(card.back, allCards, 3);

		// Combine correct answer with distractors
		const allOptions = [card.back, ...distractors];

		// Shuffle options to randomize position
		const shuffledOptions = [...allOptions].sort(() => Math.random() - 0.5);

		// Find the correct answer's index after shuffling
		const correctIdx = shuffledOptions.findIndex((opt) => opt === card.back);

		setMcOptions(shuffledOptions);
		setMcCorrectIndex(correctIdx);
		setMcSelectedIndex(null);
		setMcSubmitted(false);
	};

	/**
	 * Detects and extracts cloze terms from the answer text.
	 * Looks for bold (**text**) or highlighted (==text==) markdown syntax.
	 *
	 * @param answerText - The flashcard back/answer text
	 * @returns Array of terms that should be hidden for cloze deletion
	 */
	const detectClozeTerms = (answerText: string): string[] => {
		const terms: string[] = [];

		// Match bold text: **word** or __word__
		const boldPattern = /\*\*([^*]+)\*\*|__([^_]+)__/g;
		let match;

		while ((match = boldPattern.exec(answerText)) !== null) {
			// match[1] is for ** format, match[2] is for __ format
			const term = match[1] || match[2];
			if (term && term.trim()) {
				terms.push(term.trim());
			}
		}

		// Match highlighted text: ==word==
		const highlightPattern = /==([^=]+)==/g;
		while ((match = highlightPattern.exec(answerText)) !== null) {
			const term = match[1];
			if (term && term.trim()) {
				terms.push(term.trim());
			}
		}

		return terms;
	};

	/**
	 * Initializes cloze-deletion mode by detecting terms to hide
	 */
	const initializeClozeMode = () => {
		const terms = detectClozeTerms(card.back);
		setClozeTerms(terms);
		setClozeUserInputs(new Array(terms.length).fill(""));
		setClozeSubmitted(false);
		setClozeResults(new Array(terms.length).fill(false));
	};

	/**
	 * Effect to initialize multiple-choice mode when card or practice mode changes
	 */
	useEffect(() => {
		if (practiceMode === PracticeMode.MULTIPLE_CHOICE) {
			initializeMultipleChoice(deckCards);
		}
		// Reset type-answer mode when card changes
		if (practiceMode === PracticeMode.TYPE_ANSWER) {
			setUserAnswer("");
			setAnswerSubmitted(false);
			setComparisonResult(null);
		}
		// Initialize cloze-deletion mode when card changes
		if (practiceMode === PracticeMode.CLOZE) {
			initializeClozeMode();
		}
		// Reset hint when card changes
		setShowHint(false);
	}, [card.id, practiceMode]);

	/**
	 * Renders the front of the flashcard (question/prompt)
	 */
	const renderFront = () => {
		return (
			<div className="flashcard-front-qg">
				<div className="flashcard-front-label-qg">Question</div>
				<div className="flashcard-front-content-qg">
					<TableRenderer
						app={app}
						content={card.front}
						context="flashcard"
						sourcePath={sourcePath}
					/>
				</div>
			</div>
		);
	};

	/**
	 * Renders the back of the flashcard (answer/explanation)
	 */
	const renderBack = () => {
		if (!revealed) return null;

		return (
			<div className="flashcard-back-qg">
				<div className="flashcard-back-label-qg">Answer</div>
				<div className="flashcard-back-content-qg">
					<TableRenderer
						app={app}
						content={card.back}
						context="flashcard"
						sourcePath={sourcePath}
					/>
				</div>
			</div>
		);
	};


	/**
	 * Renders the optional hint display
	 */
	const renderHint = () => {
		// Only show hint button if card has a hint and answer hasn't been revealed
		if (!card.hint || revealed) return null;

		return (
			<div className="flashcard-hint-container-qg">
				{!showHint ? (
					<button
						className="flashcard-hint-button-qg"
						onClick={() => setShowHint(true)}
						aria-label="Show hint"
					>
						Show Hint
					</button>
				) : (
					<div className="flashcard-hint-content-qg">
						<div className="flashcard-hint-label-qg">Hint</div>
						<TableRenderer
							app={app}
							content={card.hint}
							context="flashcard"
							sourcePath={sourcePath}
						/>
					</div>
				)}
			</div>
		);
	};

	/**
	 * Renders the flag button for marking cards for later editing
	 */
	const renderFlagButton = () => {
		// Only show flag button if callback is provided
		if (!onFlagToggle) return null;

		const isFlagged = card.flagged || false;

		return (
			<div className="flashcard-flag-container-qg">
				<button
					className={`flashcard-flag-button-qg ${isFlagged ? "flashcard-flag-active-qg" : ""}`}
					onClick={() => onFlagToggle(card.id)}
					aria-label={isFlagged ? "Unflag card" : "Flag card for later"}
					title={isFlagged ? "Unflag this card" : "Flag this card for later editing"}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill={isFlagged ? "currentColor" : "none"}
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						className="flashcard-flag-icon-qg"
					>
						<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
						<line x1="4" y1="22" x2="4" y2="15" />
					</svg>
					<span className="flashcard-flag-text-qg">
						{isFlagged ? "Flagged" : "Flag"}
					</span>
				</button>
			</div>
		);
	};

	/**
	 * Renders the flashcard in standard mode
	 * Shows front, optional hint, flag button, and back when revealed
	 */
	const renderStandardMode = () => {
		return (
			<div className="flashcard-standard-mode-qg">
				{renderFront()}
				{renderHint()}
				{renderFlagButton()}
				{renderBack()}
			</div>
		);
	};

	/**
	 * Handles submission of typed answer
	 */
	const handleAnswerSubmit = () => {
		if (!userAnswer.trim()) {
			return;
		}

		// Compare user's answer with correct answer
		const result = compareAnswers(userAnswer, card.back);
		setComparisonResult(result);
		setAnswerSubmitted(true);

		// Call parent callback if provided
		if (onAnswerSubmit) {
			onAnswerSubmit(userAnswer);
		}
	};

	/**
	 * Handles Enter key press in text input
	 */
	const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleAnswerSubmit();
		}
	};

	/**
	 * Renders the type-answer practice mode
	 * Shows front, text input field, and answer comparison feedback
	 */
	const renderTypeAnswerMode = () => {
		return (
			<div className="flashcard-type-answer-mode-qg">
				{/* Show the question */}
				{renderFront()}

				{/* Show hint if available and not answered yet */}
				{!answerSubmitted && renderHint()}

				{/* Flag button */}
				{renderFlagButton()}

				{/* Answer input area */}
				{!answerSubmitted && !revealed && (
					<div className="flashcard-type-answer-input-qg">
						<div className="flashcard-type-answer-label-qg">
							Type your answer:
						</div>
						<textarea
							className="flashcard-type-answer-textarea-qg"
							value={userAnswer}
							onChange={(e) => setUserAnswer(e.target.value)}
							onKeyDown={handleKeyPress}
							placeholder="Type your answer here..."
							rows={3}
							autoFocus
						/>
						<button
							className="flashcard-type-answer-submit-qg"
							onClick={handleAnswerSubmit}
							disabled={!userAnswer.trim()}
						>
							Submit Answer
						</button>
					</div>
				)}

				{/* Show comparison result after submission */}
				{answerSubmitted && comparisonResult && (
					<div
						className={`flashcard-type-answer-result-qg ${
							comparisonResult.isCorrect
								? "flashcard-answer-correct-qg"
								: "flashcard-answer-incorrect-qg"
						}`}
					>
						<div className="flashcard-result-header-qg">
							<span className="flashcard-result-feedback-qg">
								{comparisonResult.feedback}
							</span>
							<span className="flashcard-result-similarity-qg">
								Similarity: {Math.round(comparisonResult.similarity * 100)}%
							</span>
						</div>

						<div className="flashcard-your-answer-qg">
							<div className="flashcard-your-answer-label-qg">
								Your answer:
							</div>
							<div className="flashcard-your-answer-content-qg">
								{userAnswer}
							</div>
						</div>

						<div className="flashcard-correct-answer-qg">
							<div className="flashcard-correct-answer-label-qg">
								Correct answer:
							</div>
							<div className="flashcard-correct-answer-content-qg">
								<TableRenderer
									app={app}
									content={card.back}
									context="flashcard"
									sourcePath={sourcePath}
								/>
							</div>
						</div>
					</div>
				)}

				{/* Show full answer when revealed (for cases where parent controls reveal) */}
				{revealed && !answerSubmitted && renderBack()}
			</div>
		);
	};

	/**
	 * Handles multiple-choice option selection
	 */
	const handleMcOptionClick = (index: number) => {
		if (mcSubmitted) return; // Don't allow changes after submission
		setMcSelectedIndex(index);
	};

	/**
	 * Handles multiple-choice answer submission
	 */
	const handleMcSubmit = () => {
		if (mcSelectedIndex === null) return;

		setMcSubmitted(true);

		// Call parent callback if provided
		if (onAnswerSubmit) {
			onAnswerSubmit(mcOptions[mcSelectedIndex]);
		}
	};

	/**
	 * Renders the multiple-choice practice mode
	 * Generates distractor options and displays them with the correct answer
	 */
	const renderMultipleChoiceMode = () => {
		// Check if options are initialized
		if (mcOptions.length === 0) {
			return (
				<div className="flashcard-multiple-choice-mode-qg">
					<div className="flashcard-not-implemented-qg">
						Loading options...
					</div>
				</div>
			);
		}

		return (
			<div className="flashcard-multiple-choice-mode-qg">
				{/* Show the question */}
				{renderFront()}

				{/* Show hint if available and not answered yet */}
				{!mcSubmitted && renderHint()}

				{/* Flag button */}
				{renderFlagButton()}

				{/* Multiple choice options */}
				{!revealed && (
					<div className="flashcard-mc-options-container-qg">
						<div className="flashcard-mc-options-label-qg">
							Select the correct answer:
						</div>
						<div className="flashcard-mc-options-qg">
							{mcOptions.map((option, index) => {
								const isSelected = mcSelectedIndex === index;
								const isCorrect = index === mcCorrectIndex;
								const showCorrectness = mcSubmitted;

								// Determine button state class
								let buttonClass = "flashcard-mc-option-qg";
								if (isSelected && !showCorrectness) {
									buttonClass += " flashcard-mc-option-selected-qg";
								}
								if (showCorrectness) {
									if (isCorrect) {
										buttonClass += " flashcard-mc-option-correct-qg";
									} else if (isSelected && !isCorrect) {
										buttonClass += " flashcard-mc-option-incorrect-qg";
									}
								}

								return (
									<button
										key={index}
										className={buttonClass}
										onClick={() => handleMcOptionClick(index)}
										disabled={mcSubmitted}
										data-option-index={index}
									>
										<span className="flashcard-mc-option-letter-qg">
											{String.fromCharCode(65 + index)}.
										</span>
										<span className="flashcard-mc-option-text-qg">
											{option}
										</span>
										{showCorrectness && isCorrect && (
											<span className="flashcard-mc-option-indicator-qg">
												✓
											</span>
										)}
										{showCorrectness && isSelected && !isCorrect && (
											<span className="flashcard-mc-option-indicator-qg">
												✗
											</span>
										)}
									</button>
								);
							})}
						</div>

						{/* Submit button */}
						{!mcSubmitted && (
							<button
								className="flashcard-mc-submit-qg"
								onClick={handleMcSubmit}
								disabled={mcSelectedIndex === null}
							>
								Submit Answer
							</button>
						)}

						{/* Feedback after submission */}
						{mcSubmitted && (
							<div
								className={`flashcard-mc-feedback-qg ${
									mcSelectedIndex === mcCorrectIndex
										? "flashcard-mc-feedback-correct-qg"
										: "flashcard-mc-feedback-incorrect-qg"
								}`}
							>
								{mcSelectedIndex === mcCorrectIndex
									? "Correct! Well done!"
									: "Incorrect. The correct answer is highlighted above."}
							</div>
						)}
					</div>
				)}

				{/* Show full answer when revealed by parent (if applicable) */}
				{revealed && !mcSubmitted && renderBack()}
			</div>
		);
	};

	/**
	 * Handles cloze input change
	 */
	const handleClozeInputChange = (index: number, value: string) => {
		const newInputs = [...clozeUserInputs];
		newInputs[index] = value;
		setClozeUserInputs(newInputs);
	};

	/**
	 * Handles cloze answer submission and validation
	 */
	const handleClozeSubmit = () => {
		// Validate each user input against the correct term
		const results = clozeUserInputs.map((userInput, index) => {
			const correctTerm = clozeTerms[index];
			const comparison = compareAnswers(userInput, correctTerm);
			// Consider it correct if similarity is >= 90%
			return comparison.similarity >= 0.9;
		});

		setClozeResults(results);
		setClozeSubmitted(true);

		// Call parent callback if provided
		if (onAnswerSubmit) {
			onAnswerSubmit(clozeUserInputs.join(", "));
		}
	};

	/**
	 * Renders the answer text with cloze deletions (blanks replacing bold/highlighted terms)
	 */
	const renderClozeText = () => {
		if (clozeTerms.length === 0) {
			// No cloze terms detected - show a helpful message
			return (
				<div className="flashcard-cloze-no-terms-qg">
					<p>No cloze terms detected in this flashcard.</p>
					<p>To create cloze deletions, use <strong>**bold**</strong> or <code>==highlighted==</code> text in the answer.</p>
					<div className="flashcard-back-qg" style={{ marginTop: "1em" }}>
						<div className="flashcard-back-label-qg">Full Answer:</div>
						<div className="flashcard-back-content-qg">
							<TableRenderer
								app={app}
								content={card.back}
								context="flashcard"
								sourcePath={sourcePath}
							/>
						</div>
					</div>
				</div>
			);
		}

		let answerText = card.back;
		let blankCounter = 0;

		// Replace bold and highlighted terms with numbered blanks
		answerText = answerText.replace(/\*\*([^*]+)\*\*|__([^_]+)__|==([^=]+)==/g, () => {
			const blankNumber = blankCounter++;
			return `[BLANK_${blankNumber}]`;
		});

		// Split the text by blank markers and render with inputs
		const parts = answerText.split(/(\[BLANK_\d+\])/);

		return (
			<div className="flashcard-cloze-text-qg">
				{parts.map((part, index) => {
					const blankMatch = part.match(/\[BLANK_(\d+)\]/);
					if (blankMatch) {
						const blankIndex = parseInt(blankMatch[1]);
						const isCorrect = clozeSubmitted && clozeResults[blankIndex];
						const isIncorrect = clozeSubmitted && !clozeResults[blankIndex];

						return (
							<span key={index} className="flashcard-cloze-blank-container-qg">
								<input
									type="text"
									className={`flashcard-cloze-input-qg ${
										isCorrect ? "flashcard-cloze-input-correct-qg" : ""
									} ${isIncorrect ? "flashcard-cloze-input-incorrect-qg" : ""}`}
									value={clozeUserInputs[blankIndex] || ""}
									onChange={(e) => handleClozeInputChange(blankIndex, e.target.value)}
									disabled={clozeSubmitted}
									placeholder={`blank ${blankIndex + 1}`}
									aria-label={`Fill in blank ${blankIndex + 1}`}
								/>
								{clozeSubmitted && (
									<span className="flashcard-cloze-feedback-qg">
										{isCorrect ? "✓" : "✗"}
									</span>
								)}
							</span>
						);
					} else {
						// Regular text - render as is (could contain markdown)
						return <span key={index}>{part}</span>;
					}
				})}
			</div>
		);
	};

	/**
	 * Renders the cloze-deletion practice mode
	 * Detects bold or highlighted terms and creates fill-in-the-blank inputs
	 */
	const renderClozeMode = () => {
		return (
			<div className="flashcard-cloze-mode-qg">
				{/* Show the question */}
				{renderFront()}

				{/* Show hint if available and not answered yet */}
				{!clozeSubmitted && renderHint()}

				{/* Flag button */}
				{renderFlagButton()}

				{/* Cloze deletion area */}
				{!revealed && (
					<div className="flashcard-cloze-answer-area-qg">
						<div className="flashcard-cloze-label-qg">
							Fill in the blanks:
						</div>
						<div className="flashcard-cloze-content-qg">
							{renderClozeText()}
						</div>

						{/* Submit button */}
						{clozeTerms.length > 0 && !clozeSubmitted && (
							<button
								className="flashcard-cloze-submit-qg"
								onClick={handleClozeSubmit}
								disabled={clozeUserInputs.some((input) => !input.trim())}
							>
								Submit Answers
							</button>
						)}

						{/* Show correct answers after submission */}
						{clozeSubmitted && (
							<div className="flashcard-cloze-results-qg">
								<div className="flashcard-cloze-results-header-qg">
									{clozeResults.every((r) => r) ? (
										<span className="flashcard-cloze-all-correct-qg">
											All correct! Well done!
										</span>
									) : (
										<span className="flashcard-cloze-some-incorrect-qg">
											Review the correct answers below:
										</span>
									)}
								</div>

								<div className="flashcard-cloze-correct-answers-qg">
									<div className="flashcard-cloze-correct-label-qg">
										Correct answers:
									</div>
									<ul className="flashcard-cloze-terms-list-qg">
										{clozeTerms.map((term, index) => (
											<li
												key={index}
												className={`flashcard-cloze-term-item-qg ${
													clozeResults[index]
														? "flashcard-cloze-term-correct-qg"
														: "flashcard-cloze-term-incorrect-qg"
												}`}
											>
												<span className="flashcard-cloze-term-number-qg">
													{index + 1}.
												</span>
												<span className="flashcard-cloze-term-yours-qg">
													Your answer: "{clozeUserInputs[index]}"
												</span>
												{!clozeResults[index] && (
													<span className="flashcard-cloze-term-correct-text-qg">
														→ Correct: "{term}"
													</span>
												)}
											</li>
										))}
									</ul>
								</div>

								<div className="flashcard-cloze-full-answer-qg">
									<div className="flashcard-cloze-full-answer-label-qg">
										Full answer:
									</div>
									<div className="flashcard-cloze-full-answer-content-qg">
										<TableRenderer
											app={app}
											content={card.back}
											context="flashcard"
											sourcePath={sourcePath}
										/>
									</div>
								</div>
							</div>
						)}
					</div>
				)}

				{/* Show full answer when revealed by parent (if applicable) */}
				{revealed && !clozeSubmitted && renderBack()}
			</div>
		);
	};

	/**
	 * Main render logic - routes to appropriate mode renderer
	 */
	const renderFlashcard = () => {
		switch (practiceMode) {
			case PracticeMode.STANDARD:
				return renderStandardMode();
			case PracticeMode.TYPE_ANSWER:
				return renderTypeAnswerMode();
			case PracticeMode.MULTIPLE_CHOICE:
				return renderMultipleChoiceMode();
			case PracticeMode.CLOZE:
				return renderClozeMode();
			default:
				// Fallback to standard mode for unknown modes
				return renderStandardMode();
		}
	};

	return (
		<div
			className="flashcard-container-qg"
			data-practice-mode={practiceMode}
			data-revealed={revealed}
		>
			{renderFlashcard()}
		</div>
	);
};

export default FlashcardRenderer;
