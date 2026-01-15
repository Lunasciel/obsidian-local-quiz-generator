/**
 * Unit tests for PracticeModeSelector Component
 *
 * Tests the rendering, interaction, and behavior of the practice mode selector
 * as specified in Task 37 of the implementation plan.
 *
 * Requirements addressed:
 * - Requirement 5.6: Display available practice modes with descriptions
 * - Requirement 5.6: Handle mode selection and pass to review session
 * - Requirement 5.6: Store last used mode in deck settings
 */

import { render, screen, fireEvent, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import PracticeModeSelector from "./PracticeModeSelector";
import { PracticeMode } from "../../utils/types";

describe("PracticeModeSelector - Rendering", () => {
	describe("Basic rendering", () => {
		it("should render the selector with header and subtitle", () => {
			const mockOnSelect = jest.fn();

			render(<PracticeModeSelector onSelect={mockOnSelect} />);

			expect(screen.getByText("Choose Practice Mode")).toBeInTheDocument();
			expect(screen.getByText("Select how you want to practice these flashcards")).toBeInTheDocument();
		});

		it("should render all four practice modes by default", () => {
			const mockOnSelect = jest.fn();

			render(<PracticeModeSelector onSelect={mockOnSelect} />);

			expect(screen.getByText("Standard Flashcards")).toBeInTheDocument();
			expect(screen.getByText("Type Answer")).toBeInTheDocument();
			expect(screen.getByText("Multiple Choice")).toBeInTheDocument();
			expect(screen.getByText("Cloze Deletion")).toBeInTheDocument();
		});

		it("should render mode descriptions", () => {
			const mockOnSelect = jest.fn();

			render(<PracticeModeSelector onSelect={mockOnSelect} />);

			expect(screen.getByText("Traditional flashcard experience with front and back")).toBeInTheDocument();
			expect(screen.getByText("Type your answer before revealing the correct one")).toBeInTheDocument();
			expect(screen.getByText("Select the correct answer from multiple options")).toBeInTheDocument();
			expect(screen.getByText("Fill in the blanks for key terms")).toBeInTheDocument();
		});

		it("should render mode icons", () => {
			const mockOnSelect = jest.fn();

			render(<PracticeModeSelector onSelect={mockOnSelect} />);

			// Check for icons (emojis) in the document
			expect(screen.getByText("🎴")).toBeInTheDocument(); // Standard
			expect(screen.getByText("⌨️")).toBeInTheDocument(); // Type Answer
			expect(screen.getByText("✓")).toBeInTheDocument(); // Multiple Choice
			expect(screen.getByText("📝")).toBeInTheDocument(); // Cloze
		});

		it("should render footer hint", () => {
			const mockOnSelect = jest.fn();

			render(<PracticeModeSelector onSelect={mockOnSelect} />);

			expect(screen.getByText(/You can change the practice mode at any time/)).toBeInTheDocument();
		});
	});

	describe("Limited mode rendering", () => {
		it("should render only specified modes when availableModes is provided", () => {
			const mockOnSelect = jest.fn();
			const availableModes = [PracticeMode.STANDARD, PracticeMode.TYPE_ANSWER];

			render(
				<PracticeModeSelector
					onSelect={mockOnSelect}
					availableModes={availableModes}
				/>
			);

			expect(screen.getByText("Standard Flashcards")).toBeInTheDocument();
			expect(screen.getByText("Type Answer")).toBeInTheDocument();
			expect(screen.queryByText("Multiple Choice")).not.toBeInTheDocument();
			expect(screen.queryByText("Cloze Deletion")).not.toBeInTheDocument();
		});

		it("should render a single mode when only one is available", () => {
			const mockOnSelect = jest.fn();
			const availableModes = [PracticeMode.CLOZE];

			render(
				<PracticeModeSelector
					onSelect={mockOnSelect}
					availableModes={availableModes}
				/>
			);

			expect(screen.queryByText("Standard Flashcards")).not.toBeInTheDocument();
			expect(screen.queryByText("Type Answer")).not.toBeInTheDocument();
			expect(screen.queryByText("Multiple Choice")).not.toBeInTheDocument();
			expect(screen.getByText("Cloze Deletion")).toBeInTheDocument();
		});
	});

	describe("Selected mode indication", () => {
		it("should highlight the selected mode", () => {
			const mockOnSelect = jest.fn();

			render(
				<PracticeModeSelector
					onSelect={mockOnSelect}
					selectedMode={PracticeMode.STANDARD}
				/>
			);

			// Find the Standard Flashcards card
			const standardCard = screen.getByText("Standard Flashcards").closest("[data-practice-mode]");
			expect(standardCard).toHaveClass("practice-mode-card-selected-qg");
		});

		it("should show 'Selected' indicator on selected mode", () => {
			const mockOnSelect = jest.fn();

			render(
				<PracticeModeSelector
					onSelect={mockOnSelect}
					selectedMode={PracticeMode.TYPE_ANSWER}
				/>
			);

			expect(screen.getByText("✓ Selected")).toBeInTheDocument();
		});

		it("should only have one selected mode", () => {
			const mockOnSelect = jest.fn();

			render(
				<PracticeModeSelector
					onSelect={mockOnSelect}
					selectedMode={PracticeMode.MULTIPLE_CHOICE}
				/>
			);

			// Only one "Selected" indicator should be present
			const selectedIndicators = screen.getAllByText("✓ Selected");
			expect(selectedIndicators).toHaveLength(1);
		});
	});

	describe("Last used mode indication", () => {
		it("should show 'Last Used' indicator on last used mode", () => {
			const mockOnSelect = jest.fn();

			render(
				<PracticeModeSelector
					onSelect={mockOnSelect}
					lastUsedMode={PracticeMode.CLOZE}
				/>
			);

			expect(screen.getByText("Last Used")).toBeInTheDocument();
		});

		it("should not show 'Last Used' indicator when mode is also selected", () => {
			const mockOnSelect = jest.fn();

			render(
				<PracticeModeSelector
					onSelect={mockOnSelect}
					selectedMode={PracticeMode.STANDARD}
					lastUsedMode={PracticeMode.STANDARD}
				/>
			);

			// Should only show "Selected" not "Last Used"
			expect(screen.queryByText("Last Used")).not.toBeInTheDocument();
			expect(screen.getByText("✓ Selected")).toBeInTheDocument();
		});

		it("should show both indicators on different modes", () => {
			const mockOnSelect = jest.fn();

			render(
				<PracticeModeSelector
					onSelect={mockOnSelect}
					selectedMode={PracticeMode.TYPE_ANSWER}
					lastUsedMode={PracticeMode.STANDARD}
				/>
			);

			expect(screen.getByText("Last Used")).toBeInTheDocument();
			expect(screen.getByText("✓ Selected")).toBeInTheDocument();
		});
	});
});

describe("PracticeModeSelector - Interaction", () => {
	describe("Click selection", () => {
		it("should call onSelect when a mode card is clicked", () => {
			const mockOnSelect = jest.fn();

			render(<PracticeModeSelector onSelect={mockOnSelect} />);

			const standardCard = screen.getByText("Standard Flashcards").closest("[data-practice-mode]");
			fireEvent.click(standardCard!);

			expect(mockOnSelect).toHaveBeenCalledTimes(1);
			expect(mockOnSelect).toHaveBeenCalledWith(PracticeMode.STANDARD);
		});

		it("should call onSelect with correct mode for each card", () => {
			const mockOnSelect = jest.fn();

			render(<PracticeModeSelector onSelect={mockOnSelect} />);

			// Click Type Answer
			const typeAnswerCard = screen.getByText("Type Answer").closest("[data-practice-mode]");
			fireEvent.click(typeAnswerCard!);
			expect(mockOnSelect).toHaveBeenLastCalledWith(PracticeMode.TYPE_ANSWER);

			// Click Multiple Choice
			const mcCard = screen.getByText("Multiple Choice").closest("[data-practice-mode]");
			fireEvent.click(mcCard!);
			expect(mockOnSelect).toHaveBeenLastCalledWith(PracticeMode.MULTIPLE_CHOICE);

			// Click Cloze
			const clozeCard = screen.getByText("Cloze Deletion").closest("[data-practice-mode]");
			fireEvent.click(clozeCard!);
			expect(mockOnSelect).toHaveBeenLastCalledWith(PracticeMode.CLOZE);

			expect(mockOnSelect).toHaveBeenCalledTimes(3);
		});

		it("should not call onSelect when disabled", () => {
			const mockOnSelect = jest.fn();

			render(<PracticeModeSelector onSelect={mockOnSelect} disabled={true} />);

			const standardCard = screen.getByText("Standard Flashcards").closest("[data-practice-mode]");
			fireEvent.click(standardCard!);

			expect(mockOnSelect).not.toHaveBeenCalled();
		});
	});

	describe("Keyboard navigation", () => {
		it("should call onSelect when Enter is pressed on a focused card", () => {
			const mockOnSelect = jest.fn();

			render(<PracticeModeSelector onSelect={mockOnSelect} />);

			const standardCard = screen.getByText("Standard Flashcards").closest("[data-practice-mode]") as HTMLElement;
			standardCard!.focus();
			fireEvent.keyDown(standardCard!, { key: "Enter" });

			expect(mockOnSelect).toHaveBeenCalledTimes(1);
			expect(mockOnSelect).toHaveBeenCalledWith(PracticeMode.STANDARD);
		});

		it("should call onSelect when Space is pressed on a focused card", () => {
			const mockOnSelect = jest.fn();

			render(<PracticeModeSelector onSelect={mockOnSelect} />);

			const typeAnswerCard = screen.getByText("Type Answer").closest("[data-practice-mode]") as HTMLElement;
			typeAnswerCard!.focus();
			fireEvent.keyDown(typeAnswerCard!, { key: " " });

			expect(mockOnSelect).toHaveBeenCalledTimes(1);
			expect(mockOnSelect).toHaveBeenCalledWith(PracticeMode.TYPE_ANSWER);
		});

		it("should not call onSelect for other keys", () => {
			const mockOnSelect = jest.fn();

			render(<PracticeModeSelector onSelect={mockOnSelect} />);

			const standardCard = screen.getByText("Standard Flashcards").closest("[data-practice-mode]") as HTMLElement;
			standardCard!.focus();
			fireEvent.keyDown(standardCard!, { key: "a" });
			fireEvent.keyDown(standardCard!, { key: "Tab" });
			fireEvent.keyDown(standardCard!, { key: "Escape" });

			expect(mockOnSelect).not.toHaveBeenCalled();
		});

		it("should not call onSelect with keyboard when disabled", () => {
			const mockOnSelect = jest.fn();

			render(<PracticeModeSelector onSelect={mockOnSelect} disabled={true} />);

			const standardCard = screen.getByText("Standard Flashcards").closest("[data-practice-mode]");
			fireEvent.keyDown(standardCard!, { key: "Enter" });

			expect(mockOnSelect).not.toHaveBeenCalled();
		});
	});

	describe("Accessibility", () => {
		it("should have proper ARIA role for mode cards", () => {
			const mockOnSelect = jest.fn();

			render(<PracticeModeSelector onSelect={mockOnSelect} />);

			const cards = screen.getAllByRole("button");
			expect(cards.length).toBe(4); // All 4 practice modes
		});

		it("should have proper ARIA labels for mode cards", () => {
			const mockOnSelect = jest.fn();

			render(<PracticeModeSelector onSelect={mockOnSelect} />);

			expect(screen.getByLabelText("Select Standard Flashcards practice mode") as HTMLElement).toBeInTheDocument();
			expect(screen.getByLabelText("Select Type Answer practice mode") as HTMLElement).toBeInTheDocument();
			expect(screen.getByLabelText("Select Multiple Choice practice mode") as HTMLElement).toBeInTheDocument();
			expect(screen.getByLabelText("Select Cloze Deletion practice mode") as HTMLElement).toBeInTheDocument();
		});

		it("should set aria-pressed to true for selected mode", () => {
			const mockOnSelect = jest.fn();

			render(
				<PracticeModeSelector
					onSelect={mockOnSelect}
					selectedMode={PracticeMode.STANDARD}
				/>
			);

			const standardCard = screen.getByText("Standard Flashcards").closest("[data-practice-mode]");
			expect(standardCard).toHaveAttribute("aria-pressed", "true");
		});

		it("should set aria-pressed to false for non-selected modes", () => {
			const mockOnSelect = jest.fn();

			render(
				<PracticeModeSelector
					onSelect={mockOnSelect}
					selectedMode={PracticeMode.STANDARD}
				/>
			);

			const typeAnswerCard = screen.getByText("Type Answer").closest("[data-practice-mode]");
			expect(typeAnswerCard).toHaveAttribute("aria-pressed", "false");
		});

		it("should be keyboard focusable when not disabled", () => {
			const mockOnSelect = jest.fn();

			render(<PracticeModeSelector onSelect={mockOnSelect} />);

			const cards = screen.getAllByRole("button");
			cards.forEach(card => {
				expect(card).toHaveAttribute("tabIndex", "0");
			});
		});

		it("should not be keyboard focusable when disabled", () => {
			const mockOnSelect = jest.fn();

			render(<PracticeModeSelector onSelect={mockOnSelect} disabled={true} />);

			const cards = screen.getAllByRole("button");
			cards.forEach(card => {
				expect(card).toHaveAttribute("tabIndex", "-1");
			});
		});
	});
});

describe("PracticeModeSelector - Styling", () => {
	describe("CSS classes", () => {
		it("should apply disabled class when disabled", () => {
			const mockOnSelect = jest.fn();

			render(<PracticeModeSelector onSelect={mockOnSelect} disabled={true} />);

			const cards = screen.getAllByRole("button");
			cards.forEach(card => {
				expect(card).toHaveClass("practice-mode-card-disabled-qg");
			});
		});

		it("should not apply disabled class when not disabled", () => {
			const mockOnSelect = jest.fn();

			render(<PracticeModeSelector onSelect={mockOnSelect} disabled={false} />);

			const cards = screen.getAllByRole("button");
			cards.forEach(card => {
				expect(card).not.toHaveClass("practice-mode-card-disabled-qg");
			});
		});

		it("should apply correct data attributes", () => {
			const mockOnSelect = jest.fn();

			render(<PracticeModeSelector onSelect={mockOnSelect} />);

			expect(screen.getByText("Standard Flashcards").closest("[data-practice-mode]"))
				.toHaveAttribute("data-practice-mode", PracticeMode.STANDARD);
			expect(screen.getByText("Type Answer").closest("[data-practice-mode]"))
				.toHaveAttribute("data-practice-mode", PracticeMode.TYPE_ANSWER);
			expect(screen.getByText("Multiple Choice").closest("[data-practice-mode]"))
				.toHaveAttribute("data-practice-mode", PracticeMode.MULTIPLE_CHOICE);
			expect(screen.getByText("Cloze Deletion").closest("[data-practice-mode]"))
				.toHaveAttribute("data-practice-mode", PracticeMode.CLOZE);
		});
	});
});

describe("PracticeModeSelector - Mode Features", () => {
	describe("Standard mode features", () => {
		it("should display all standard mode features", () => {
			const mockOnSelect = jest.fn();

			render(<PracticeModeSelector onSelect={mockOnSelect} />);

			const standardCard = screen.getByText("Standard Flashcards").closest("[data-practice-mode]") as HTMLElement;
			expect(within(standardCard).getByText("Show question first")).toBeInTheDocument();
			expect(within(standardCard).getByText("Reveal answer when ready")).toBeInTheDocument();
			expect(within(standardCard).getByText("Optional hints available")).toBeInTheDocument();
			expect(within(standardCard).getByText("Perfect for quick reviews")).toBeInTheDocument();
		});
	});

	describe("Type Answer mode features", () => {
		it("should display all type answer mode features", () => {
			const mockOnSelect = jest.fn();

			render(<PracticeModeSelector onSelect={mockOnSelect} />);

			const typeAnswerCard = screen.getByText("Type Answer").closest("[data-practice-mode]") as HTMLElement;
			expect(within(typeAnswerCard).getByText("Active recall practice")).toBeInTheDocument();
			expect(within(typeAnswerCard).getByText("Compare your answer")).toBeInTheDocument();
			expect(within(typeAnswerCard).getByText("Similarity scoring")).toBeInTheDocument();
			expect(within(typeAnswerCard).getByText("Deeper engagement")).toBeInTheDocument();
		});
	});

	describe("Multiple Choice mode features", () => {
		it("should display all multiple choice mode features", () => {
			const mockOnSelect = jest.fn();

			render(<PracticeModeSelector onSelect={mockOnSelect} />);

			const mcCard = screen.getByText("Multiple Choice").closest("[data-practice-mode]") as HTMLElement;
			expect(within(mcCard).getByText("Generated distractors")).toBeInTheDocument();
			expect(within(mcCard).getByText("Instant feedback")).toBeInTheDocument();
			expect(within(mcCard).getByText("Recognition practice")).toBeInTheDocument();
			expect(within(mcCard).getByText("Good for testing")).toBeInTheDocument();
		});
	});

	describe("Cloze mode features", () => {
		it("should display all cloze deletion mode features", () => {
			const mockOnSelect = jest.fn();

			render(<PracticeModeSelector onSelect={mockOnSelect} />);

			const clozeCard = screen.getByText("Cloze Deletion").closest("[data-practice-mode]") as HTMLElement;
			expect(within(clozeCard).getByText("Fill-in-the-blank style")).toBeInTheDocument();
			expect(within(clozeCard).getByText("Focus on key terms")).toBeInTheDocument();
			expect(within(clozeCard).getByText("Multiple blanks support")).toBeInTheDocument();
			expect(within(clozeCard).getByText("Contextual learning")).toBeInTheDocument();
		});
	});
});

describe("PracticeModeSelector - Edge Cases", () => {
	it("should handle empty availableModes array gracefully", () => {
		const mockOnSelect = jest.fn();

		render(
			<PracticeModeSelector
				onSelect={mockOnSelect}
				availableModes={[]}
			/>
		);

		// Should render container but no mode cards
		expect(screen.getByText("Choose Practice Mode")).toBeInTheDocument();
		expect(screen.queryByText("Standard Flashcards")).not.toBeInTheDocument();
	});

	it("should handle multiple rapid clicks correctly", () => {
		const mockOnSelect = jest.fn();

		render(<PracticeModeSelector onSelect={mockOnSelect} />);

		const standardCard = screen.getByText("Standard Flashcards").closest("[data-practice-mode]");

		// Rapidly click the same card
		fireEvent.click(standardCard!);
		fireEvent.click(standardCard!);
		fireEvent.click(standardCard!);

		expect(mockOnSelect).toHaveBeenCalledTimes(3);
		expect(mockOnSelect).toHaveBeenCalledWith(PracticeMode.STANDARD);
	});

	it("should handle switching between modes", () => {
		const mockOnSelect = jest.fn();

		const { rerender } = render(
			<PracticeModeSelector
				onSelect={mockOnSelect}
				selectedMode={PracticeMode.STANDARD}
			/>
		);

		expect(screen.getByText("Standard Flashcards").closest("[data-practice-mode]"))
			.toHaveClass("practice-mode-card-selected-qg");

		// Update selected mode
		rerender(
			<PracticeModeSelector
				onSelect={mockOnSelect}
				selectedMode={PracticeMode.TYPE_ANSWER}
			/>
		);

		expect(screen.getByText("Type Answer").closest("[data-practice-mode]"))
			.toHaveClass("practice-mode-card-selected-qg");
		expect(screen.getByText("Standard Flashcards").closest("[data-practice-mode]"))
			.not.toHaveClass("practice-mode-card-selected-qg");
	});

	it("should handle undefined selectedMode", () => {
		const mockOnSelect = jest.fn();

		render(
			<PracticeModeSelector
				onSelect={mockOnSelect}
				selectedMode={undefined}
			/>
		);

		const cards = screen.getAllByRole("button");
		cards.forEach(card => {
			expect(card).not.toHaveClass("practice-mode-card-selected-qg");
			expect(card).toHaveAttribute("aria-pressed", "false");
		});
	});
});
