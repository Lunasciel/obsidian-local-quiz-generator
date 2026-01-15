/**
 * UI and interaction tests for FlashcardRenderer Multiple-Choice Practice Mode
 *
 * Tests the rendering, user interaction, and visual feedback for multiple-choice mode
 * as specified in Task 35 of the implementation plan.
 *
 * Requirements addressed:
 * - Requirement 5.3: Display options in random order
 * - Requirement 5.3: Highlight correct/incorrect answers on submission
 * - Requirement 5.5: Interactive feedback for practice modes
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import FlashcardRenderer from "./FlashcardRenderer";
import { Flashcard, PracticeMode } from "../../utils/types";
import { App } from "obsidian";

/**
 * Mock Obsidian App for testing
 */
const mockApp = {
	vault: {},
	workspace: {},
	metadataCache: {}
} as unknown as App;

/**
 * Helper function to create a mock flashcard for testing
 */
function createMockFlashcard(id: string, front: string, back: string, hint?: string): Flashcard {
	return {
		id,
		front,
		back,
		deckId: "test-deck",
		created: Date.now(),
		modified: Date.now(),
		tags: [],
		sourceFile: undefined,
		hint,
		media: undefined
	};
}

describe("FlashcardRenderer - Multiple-Choice Mode - UI Rendering", () => {
	const mockCard = createMockFlashcard(
		"card-1",
		"What is the capital of France?",
		"Paris"
	);

	const mockDeckCards: Flashcard[] = [
		mockCard,
		createMockFlashcard("card-2", "What is the capital of Germany?", "Berlin"),
		createMockFlashcard("card-3", "What is the capital of Italy?", "Rome"),
		createMockFlashcard("card-4", "What is the capital of Spain?", "Madrid")
	];

	describe("Initial rendering", () => {
		it("should render the question", () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.MULTIPLE_CHOICE}
					deckCards={mockDeckCards}
				/>
			);

			expect(screen.getByText("Question")).toBeInTheDocument();
		});

		it("should render 4 option buttons", async () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.MULTIPLE_CHOICE}
					deckCards={mockDeckCards}
				/>
			);

			// Wait for options to be initialized
			await waitFor(() => {
				const buttons = screen.getAllByRole("button");
				// Should have 4 option buttons + 1 submit button
				expect(buttons.length).toBeGreaterThanOrEqual(4);
			});
		});

		it("should render options with letter labels (A, B, C, D)", async () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.MULTIPLE_CHOICE}
					deckCards={mockDeckCards}
				/>
			);

			await waitFor(() => {
				expect(screen.getByText(/A\./)).toBeInTheDocument();
				expect(screen.getByText(/B\./)).toBeInTheDocument();
				expect(screen.getByText(/C\./)).toBeInTheDocument();
				expect(screen.getByText(/D\./)).toBeInTheDocument();
			});
		});

		it("should render the submit button", async () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.MULTIPLE_CHOICE}
					deckCards={mockDeckCards}
				/>
			);

			await waitFor(() => {
				expect(screen.getByText("Submit Answer")).toBeInTheDocument();
			});
		});

		it("should render the correct answer among the options", async () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.MULTIPLE_CHOICE}
					deckCards={mockDeckCards}
				/>
			);

			await waitFor(() => {
				expect(screen.getByText("Paris")).toBeInTheDocument();
			});
		});

		it("should render distractors from other cards", async () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.MULTIPLE_CHOICE}
					deckCards={mockDeckCards}
				/>
			);

			await waitFor(() => {
				const allText = screen.getByText(/Berlin|Rome|Madrid/);
				expect(allText).toBeInTheDocument();
			});
		});

		it("should disable submit button when no option is selected", async () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.MULTIPLE_CHOICE}
					deckCards={mockDeckCards}
				/>
			);

			await waitFor(() => {
				const submitButton = screen.getByText("Submit Answer");
				expect(submitButton).toBeDisabled();
			});
		});

		it("should render hint button if hint is available", async () => {
			const cardWithHint = createMockFlashcard(
				"card-with-hint",
				"What is the capital of France?",
				"Paris",
				"Think of the Eiffel Tower"
			);

			render(
				<FlashcardRenderer
					app={mockApp}
					card={cardWithHint}
					revealed={false}
					practiceMode={PracticeMode.MULTIPLE_CHOICE}
					deckCards={mockDeckCards}
				/>
			);

			await waitFor(() => {
				expect(screen.getByText("Show Hint")).toBeInTheDocument();
			});
		});
	});

	describe("User interaction", () => {
		it("should allow selecting an option", async () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.MULTIPLE_CHOICE}
					deckCards={mockDeckCards}
				/>
			);

			await waitFor(() => {
				const optionButtons = screen.getAllByRole("button").filter(
					(btn) => !btn.textContent?.includes("Submit")
				);
				expect(optionButtons.length).toBeGreaterThan(0);

				// Click the first option
				fireEvent.click(optionButtons[0]);

				// Submit button should now be enabled
				const submitButton = screen.getByText("Submit Answer");
				expect(submitButton).not.toBeDisabled();
			});
		});

		it("should highlight selected option", async () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.MULTIPLE_CHOICE}
					deckCards={mockDeckCards}
				/>
			);

			await waitFor(async () => {
				const optionButtons = screen.getAllByRole("button").filter(
					(btn) => !btn.textContent?.includes("Submit")
				);

				// Click the first option
				fireEvent.click(optionButtons[0]);

				await waitFor(() => {
					expect(optionButtons[0]).toHaveClass("flashcard-mc-option-selected-qg");
				});
			});
		});

		it("should allow changing selection before submission", async () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.MULTIPLE_CHOICE}
					deckCards={mockDeckCards}
				/>
			);

			await waitFor(async () => {
				const optionButtons = screen.getAllByRole("button").filter(
					(btn) => !btn.textContent?.includes("Submit")
				);

				// Click first option
				fireEvent.click(optionButtons[0]);
				await waitFor(() => {
					expect(optionButtons[0]).toHaveClass("flashcard-mc-option-selected-qg");
				});

				// Click second option
				fireEvent.click(optionButtons[1]);
				await waitFor(() => {
					expect(optionButtons[1]).toHaveClass("flashcard-mc-option-selected-qg");
					expect(optionButtons[0]).not.toHaveClass("flashcard-mc-option-selected-qg");
				});
			});
		});

		it("should show hint when hint button is clicked", async () => {
			const cardWithHint = createMockFlashcard(
				"card-with-hint",
				"What is the capital of France?",
				"Paris",
				"Think of the Eiffel Tower"
			);

			render(
				<FlashcardRenderer
					app={mockApp}
					card={cardWithHint}
					revealed={false}
					practiceMode={PracticeMode.MULTIPLE_CHOICE}
					deckCards={mockDeckCards}
				/>
			);

			await waitFor(() => {
				const hintButton = screen.getByText("Show Hint");
				fireEvent.click(hintButton);

				expect(screen.getByText("Hint")).toBeInTheDocument();
			});
		});
	});

	describe("Answer submission and feedback", () => {
		it("should show feedback after submitting correct answer", async () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.MULTIPLE_CHOICE}
					deckCards={mockDeckCards}
				/>
			);

			await waitFor(async () => {
				// Find and click the correct answer (Paris)
				const parisButton = screen.getByText("Paris").closest("button");
				if (parisButton) {
					fireEvent.click(parisButton);

					// Submit the answer
					const submitButton = screen.getByText("Submit Answer");
					fireEvent.click(submitButton);

					await waitFor(() => {
						expect(screen.getByText(/Correct! Well done!/)).toBeInTheDocument();
					});
				}
			});
		});

		it("should highlight correct answer in green after submission", async () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.MULTIPLE_CHOICE}
					deckCards={mockDeckCards}
				/>
			);

			await waitFor(async () => {
				const parisButton = screen.getByText("Paris").closest("button");
				if (parisButton) {
					fireEvent.click(parisButton);

					const submitButton = screen.getByText("Submit Answer");
					fireEvent.click(submitButton);

					await waitFor(() => {
						expect(parisButton).toHaveClass("flashcard-mc-option-correct-qg");
					});
				}
			});
		});

		it("should show checkmark on correct answer after submission", async () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.MULTIPLE_CHOICE}
					deckCards={mockDeckCards}
				/>
			);

			await waitFor(async () => {
				const parisButton = screen.getByText("Paris").closest("button");
				if (parisButton) {
					fireEvent.click(parisButton);

					const submitButton = screen.getByText("Submit Answer");
					fireEvent.click(submitButton);

					await waitFor(() => {
						expect(screen.getByText("✓")).toBeInTheDocument();
					});
				}
			});
		});

		it("should show feedback after submitting incorrect answer", async () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.MULTIPLE_CHOICE}
					deckCards={mockDeckCards}
				/>
			);

			await waitFor(async () => {
				// Find and click an incorrect answer
				const incorrectButton = screen.getByText("Berlin").closest("button");
				if (incorrectButton) {
					fireEvent.click(incorrectButton);

					const submitButton = screen.getByText("Submit Answer");
					fireEvent.click(submitButton);

					await waitFor(() => {
						expect(
							screen.getByText(/Incorrect\. The correct answer is highlighted above\./)
						).toBeInTheDocument();
					});
				}
			});
		});

		it("should highlight incorrect answer in red and correct answer in green", async () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.MULTIPLE_CHOICE}
					deckCards={mockDeckCards}
				/>
			);

			await waitFor(async () => {
				const incorrectButton = screen.getByText("Berlin").closest("button");
				const correctButton = screen.getByText("Paris").closest("button");

				if (incorrectButton && correctButton) {
					fireEvent.click(incorrectButton);

					const submitButton = screen.getByText("Submit Answer");
					fireEvent.click(submitButton);

					await waitFor(() => {
						expect(incorrectButton).toHaveClass("flashcard-mc-option-incorrect-qg");
						expect(correctButton).toHaveClass("flashcard-mc-option-correct-qg");
					});
				}
			});
		});

		it("should show cross mark on incorrect answer after submission", async () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.MULTIPLE_CHOICE}
					deckCards={mockDeckCards}
				/>
			);

			await waitFor(async () => {
				const incorrectButton = screen.getByText("Berlin").closest("button");
				if (incorrectButton) {
					fireEvent.click(incorrectButton);

					const submitButton = screen.getByText("Submit Answer");
					fireEvent.click(submitButton);

					await waitFor(() => {
						expect(screen.getByText("✗")).toBeInTheDocument();
					});
				}
			});
		});

		it("should disable options after submission", async () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.MULTIPLE_CHOICE}
					deckCards={mockDeckCards}
				/>
			);

			await waitFor(async () => {
				const parisButton = screen.getByText("Paris").closest("button");
				if (parisButton) {
					fireEvent.click(parisButton);

					const submitButton = screen.getByText("Submit Answer");
					fireEvent.click(submitButton);

					await waitFor(() => {
						const optionButtons = screen.getAllByRole("button").filter(
							(btn) => btn.getAttribute("data-option-index") !== null
						);
						optionButtons.forEach((btn) => {
							expect(btn).toBeDisabled();
						});
					});
				}
			});
		});

		it("should hide submit button after submission", async () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.MULTIPLE_CHOICE}
					deckCards={mockDeckCards}
				/>
			);

			await waitFor(async () => {
				const parisButton = screen.getByText("Paris").closest("button");
				if (parisButton) {
					fireEvent.click(parisButton);

					const submitButton = screen.getByText("Submit Answer");
					fireEvent.click(submitButton);

					await waitFor(() => {
						expect(screen.queryByText("Submit Answer")).not.toBeInTheDocument();
					});
				}
			});
		});

		it("should hide hint after submission", async () => {
			const cardWithHint = createMockFlashcard(
				"card-with-hint",
				"What is the capital of France?",
				"Paris",
				"Think of the Eiffel Tower"
			);

			render(
				<FlashcardRenderer
					app={mockApp}
					card={cardWithHint}
					revealed={false}
					practiceMode={PracticeMode.MULTIPLE_CHOICE}
					deckCards={mockDeckCards}
				/>
			);

			await waitFor(async () => {
				const parisButton = screen.getByText("Paris").closest("button");
				if (parisButton) {
					fireEvent.click(parisButton);

					const submitButton = screen.getByText("Submit Answer");
					fireEvent.click(submitButton);

					await waitFor(() => {
						expect(screen.queryByText("Show Hint")).not.toBeInTheDocument();
					});
				}
			});
		});
	});

	describe("Callback functionality", () => {
		it("should call onAnswerSubmit callback with selected answer", async () => {
			const mockCallback = jest.fn();

			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.MULTIPLE_CHOICE}
					deckCards={mockDeckCards}
					onAnswerSubmit={mockCallback}
				/>
			);

			await waitFor(async () => {
				const parisButton = screen.getByText("Paris").closest("button");
				if (parisButton) {
					fireEvent.click(parisButton);

					const submitButton = screen.getByText("Submit Answer");
					fireEvent.click(submitButton);

					await waitFor(() => {
						expect(mockCallback).toHaveBeenCalledWith("Paris");
					});
				}
			});
		});

		it("should call onAnswerSubmit callback even for incorrect answer", async () => {
			const mockCallback = jest.fn();

			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.MULTIPLE_CHOICE}
					deckCards={mockDeckCards}
					onAnswerSubmit={mockCallback}
				/>
			);

			await waitFor(async () => {
				const berlinButton = screen.getByText("Berlin").closest("button");
				if (berlinButton) {
					fireEvent.click(berlinButton);

					const submitButton = screen.getByText("Submit Answer");
					fireEvent.click(submitButton);

					await waitFor(() => {
						expect(mockCallback).toHaveBeenCalledWith("Berlin");
					});
				}
			});
		});
	});

	describe("Edge cases", () => {
		it("should handle deck with no other cards", async () => {
			const singleCardDeck = [mockCard];

			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.MULTIPLE_CHOICE}
					deckCards={singleCardDeck}
				/>
			);

			await waitFor(() => {
				// Should still render options (with placeholders)
				const buttons = screen.getAllByRole("button");
				expect(buttons.length).toBeGreaterThan(0);
			});
		});

		it("should reset state when card changes", async () => {
			const { rerender } = render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.MULTIPLE_CHOICE}
					deckCards={mockDeckCards}
				/>
			);

			// Change to a different card
			const newCard = createMockFlashcard(
				"card-5",
				"What is the capital of Portugal?",
				"Lisbon"
			);

			rerender(
				<FlashcardRenderer
					app={mockApp}
					card={newCard}
					revealed={false}
					practiceMode={PracticeMode.MULTIPLE_CHOICE}
					deckCards={mockDeckCards}
				/>
			);

			await waitFor(() => {
				// New question should be displayed
				expect(screen.getByText("What is the capital of Portugal?")).toBeInTheDocument();
			});
		});
	});
});
