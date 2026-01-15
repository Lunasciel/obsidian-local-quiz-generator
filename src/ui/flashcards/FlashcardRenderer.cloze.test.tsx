/**
 * UI and interaction tests for FlashcardRenderer Cloze-Deletion Practice Mode
 *
 * Tests the rendering, cloze term detection, fill-in-the-blank inputs,
 * and answer validation for cloze-deletion mode as specified in Task 36
 * of the implementation plan.
 *
 * Requirements addressed:
 * - Requirement 5.4: Detect and hide key terms (bold/highlighted)
 * - Requirement 5.4: Create fill-in-the-blank inputs
 * - Requirement 5.4: Validate user input against hidden terms
 * - Requirement 5.5: Provide immediate feedback on correctness
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

describe("FlashcardRenderer - Cloze-Deletion Mode - Term Detection", () => {
	describe("Bold text detection", () => {
		it("should detect and extract bold terms using ** syntax", () => {
			const card = createMockFlashcard(
				"card-1",
				"What is the capital of France?",
				"The capital of France is **Paris**."
			);

			render(
				<FlashcardRenderer
					app={mockApp}
					card={card}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			// Should render an input for the cloze blank
			const inputs = screen.getAllByRole("textbox");
			expect(inputs.length).toBe(1);
			expect(inputs[0]).toHaveAttribute("placeholder", "blank 1");
		});

		it("should detect and extract bold terms using __ syntax", () => {
			const card = createMockFlashcard(
				"card-2",
				"What is the chemical symbol for water?",
				"The chemical symbol for water is __H2O__."
			);

			render(
				<FlashcardRenderer
					app={mockApp}
					card={card}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			const inputs = screen.getAllByRole("textbox");
			expect(inputs.length).toBe(1);
		});

		it("should detect multiple bold terms in a single answer", () => {
			const card = createMockFlashcard(
				"card-3",
				"What are the primary colors?",
				"The primary colors are **red**, **blue**, and **yellow**."
			);

			render(
				<FlashcardRenderer
					app={mockApp}
					card={card}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			const inputs = screen.getAllByRole("textbox");
			expect(inputs.length).toBe(3);
		});
	});

	describe("Highlighted text detection", () => {
		it("should detect and extract highlighted terms using == syntax", () => {
			const card = createMockFlashcard(
				"card-4",
				"What is the speed of light?",
				"The speed of light is ==299,792,458 m/s==."
			);

			render(
				<FlashcardRenderer
					app={mockApp}
					card={card}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			const inputs = screen.getAllByRole("textbox");
			expect(inputs.length).toBe(1);
		});
	});

	describe("Mixed formatting detection", () => {
		it("should detect both bold and highlighted terms", () => {
			const card = createMockFlashcard(
				"card-5",
				"What are the states of matter?",
				"The three main states of matter are **solid**, ==liquid==, and **gas**."
			);

			render(
				<FlashcardRenderer
					app={mockApp}
					card={card}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			const inputs = screen.getAllByRole("textbox");
			expect(inputs.length).toBe(3);
		});
	});

	describe("No cloze terms", () => {
		it("should display a helpful message when no bold or highlighted text is found", () => {
			const card = createMockFlashcard(
				"card-6",
				"What is a plain answer?",
				"This is a plain answer with no formatting."
			);

			render(
				<FlashcardRenderer
					app={mockApp}
					card={card}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			expect(screen.getByText(/No cloze terms detected/i)).toBeInTheDocument();
			expect(screen.getByText(/use \*\*bold\*\*/i)).toBeInTheDocument();
		});
	});
});

describe("FlashcardRenderer - Cloze-Deletion Mode - UI Rendering", () => {
	const mockCard = createMockFlashcard(
		"card-1",
		"What is the capital of France?",
		"The capital of France is **Paris**, located on the **Seine** river."
	);

	describe("Initial rendering", () => {
		it("should render the question", () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			expect(screen.getByText("Question")).toBeInTheDocument();
		});

		it("should render fill in the blanks label", () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			expect(screen.getByText("Fill in the blanks:")).toBeInTheDocument();
		});

		it("should render input fields for each cloze term", () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			const inputs = screen.getAllByRole("textbox");
			expect(inputs.length).toBe(2); // Paris and Seine
		});

		it("should render submit button", () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			expect(screen.getByText("Submit Answers")).toBeInTheDocument();
		});

		it("should have submit button disabled when inputs are empty", () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			const submitButton = screen.getByText("Submit Answers");
			expect(submitButton).toBeDisabled();
		});
	});

	describe("Hint display", () => {
		it("should show hint button when card has a hint", () => {
			const cardWithHint = createMockFlashcard(
				"card-hint",
				"What is the capital of France?",
				"The capital is **Paris**.",
				"Think of the Eiffel Tower"
			);

			render(
				<FlashcardRenderer
					app={mockApp}
					card={cardWithHint}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			expect(screen.getByText("Show Hint")).toBeInTheDocument();
		});

		it("should not show hint button when card has no hint", () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			expect(screen.queryByText("Show Hint")).not.toBeInTheDocument();
		});
	});
});

describe("FlashcardRenderer - Cloze-Deletion Mode - User Interactions", () => {
	const mockCard = createMockFlashcard(
		"card-1",
		"What are the colors?",
		"The colors are **red** and **blue**."
	);

	describe("Input interactions", () => {
		it("should allow typing in input fields", () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];

			fireEvent.change(inputs[0], { target: { value: "red" } });
			expect(inputs[0].value).toBe("red");

			fireEvent.change(inputs[1], { target: { value: "blue" } });
			expect(inputs[1].value).toBe("blue");
		});

		it("should enable submit button when all inputs are filled", () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
			const submitButton = screen.getByText("Submit Answers");

			fireEvent.change(inputs[0], { target: { value: "red" } });
			fireEvent.change(inputs[1], { target: { value: "blue" } });

			expect(submitButton).not.toBeDisabled();
		});

		it("should keep submit button disabled if any input is empty", () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
			const submitButton = screen.getByText("Submit Answers");

			fireEvent.change(inputs[0], { target: { value: "red" } });
			// Leave second input empty

			expect(submitButton).toBeDisabled();
		});
	});

	describe("Answer submission", () => {
		it("should display results after submission", () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
			const submitButton = screen.getByText("Submit Answers");

			fireEvent.change(inputs[0], { target: { value: "red" } });
			fireEvent.change(inputs[1], { target: { value: "blue" } });
			fireEvent.click(submitButton);

			expect(screen.getByText("Correct answers:")).toBeInTheDocument();
		});

		it("should disable inputs after submission", () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
			const submitButton = screen.getByText("Submit Answers");

			fireEvent.change(inputs[0], { target: { value: "red" } });
			fireEvent.change(inputs[1], { target: { value: "blue" } });
			fireEvent.click(submitButton);

			inputs.forEach((input) => {
				expect(input).toBeDisabled();
			});
		});

		it("should hide submit button after submission", () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
			const submitButton = screen.getByText("Submit Answers");

			fireEvent.change(inputs[0], { target: { value: "red" } });
			fireEvent.change(inputs[1], { target: { value: "blue" } });
			fireEvent.click(submitButton);

			expect(screen.queryByText("Submit Answers")).not.toBeInTheDocument();
		});
	});
});

describe("FlashcardRenderer - Cloze-Deletion Mode - Answer Validation", () => {
	const mockCard = createMockFlashcard(
		"card-1",
		"What is the element?",
		"The element is **Oxygen**."
	);

	describe("Exact matches", () => {
		it("should mark exact matches as correct", () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
			const submitButton = screen.getByText("Submit Answers");

			fireEvent.change(inputs[0], { target: { value: "Oxygen" } });
			fireEvent.click(submitButton);

			// Check for success feedback
			expect(screen.getByText("All correct! Well done!")).toBeInTheDocument();
		});

		it("should mark case-insensitive matches as correct", () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
			const submitButton = screen.getByText("Submit Answers");

			fireEvent.change(inputs[0], { target: { value: "oxygen" } });
			fireEvent.click(submitButton);

			expect(screen.getByText("All correct! Well done!")).toBeInTheDocument();
		});
	});

	describe("Fuzzy matching", () => {
		it("should mark answers with minor typos as correct (>90% similarity)", () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
			const submitButton = screen.getByText("Submit Answers");

			// "Oxygne" is very close to "Oxygen"
			fireEvent.change(inputs[0], { target: { value: "Oxygne" } });
			fireEvent.click(submitButton);

			expect(screen.getByText("All correct! Well done!")).toBeInTheDocument();
		});

		it("should mark significantly different answers as incorrect", () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
			const submitButton = screen.getByText("Submit Answers");

			fireEvent.change(inputs[0], { target: { value: "Nitrogen" } });
			fireEvent.click(submitButton);

			expect(screen.getByText("Review the correct answers below:")).toBeInTheDocument();
		});
	});

	describe("Visual feedback", () => {
		it("should show checkmarks for correct answers", () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
			const submitButton = screen.getByText("Submit Answers");

			fireEvent.change(inputs[0], { target: { value: "Oxygen" } });
			fireEvent.click(submitButton);

			// Should show checkmark
			expect(screen.getByText("✓")).toBeInTheDocument();
		});

		it("should show X marks for incorrect answers", () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
			const submitButton = screen.getByText("Submit Answers");

			fireEvent.change(inputs[0], { target: { value: "Wrong" } });
			fireEvent.click(submitButton);

			// Should show X mark
			expect(screen.getByText("✗")).toBeInTheDocument();
		});

		it("should apply correct styling class to correct inputs", () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
			const submitButton = screen.getByText("Submit Answers");

			fireEvent.change(inputs[0], { target: { value: "Oxygen" } });
			fireEvent.click(submitButton);

			expect(inputs[0]).toHaveClass("flashcard-cloze-input-correct-qg");
		});

		it("should apply incorrect styling class to incorrect inputs", () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
			const submitButton = screen.getByText("Submit Answers");

			fireEvent.change(inputs[0], { target: { value: "Wrong" } });
			fireEvent.click(submitButton);

			expect(inputs[0]).toHaveClass("flashcard-cloze-input-incorrect-qg");
		});
	});

	describe("Results display", () => {
		it("should show full answer after submission", () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
			const submitButton = screen.getByText("Submit Answers");

			fireEvent.change(inputs[0], { target: { value: "Oxygen" } });
			fireEvent.click(submitButton);

			expect(screen.getByText("Full answer:")).toBeInTheDocument();
		});

		it("should display user answers in results", () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
			const submitButton = screen.getByText("Submit Answers");

			fireEvent.change(inputs[0], { target: { value: "Wrong" } });
			fireEvent.click(submitButton);

			expect(screen.getByText(/Your answer: "Wrong"/)).toBeInTheDocument();
		});

		it("should show correct answer for incorrect responses", () => {
			render(
				<FlashcardRenderer
					app={mockApp}
					card={mockCard}
					revealed={false}
					practiceMode={PracticeMode.CLOZE}
				/>
			);

			const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
			const submitButton = screen.getByText("Submit Answers");

			fireEvent.change(inputs[0], { target: { value: "Wrong" } });
			fireEvent.click(submitButton);

			expect(screen.getByText(/Correct: "Oxygen"/)).toBeInTheDocument();
		});
	});
});

describe("FlashcardRenderer - Cloze-Deletion Mode - Multiple Terms", () => {
	const mockCard = createMockFlashcard(
		"card-multi",
		"What are the chemical symbols?",
		"**H** is for Hydrogen, **O** is for Oxygen, and **C** is for Carbon."
	);

	it("should handle multiple cloze terms correctly", () => {
		render(
			<FlashcardRenderer
				app={mockApp}
				card={mockCard}
				revealed={false}
				practiceMode={PracticeMode.CLOZE}
			/>
		);

		const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
		expect(inputs.length).toBe(3);

		const submitButton = screen.getByText("Submit Answers");

		fireEvent.change(inputs[0], { target: { value: "H" } });
		fireEvent.change(inputs[1], { target: { value: "O" } });
		fireEvent.change(inputs[2], { target: { value: "C" } });
		fireEvent.click(submitButton);

		expect(screen.getByText("All correct! Well done!")).toBeInTheDocument();
	});

	it("should show mixed feedback when some answers are correct and some incorrect", () => {
		render(
			<FlashcardRenderer
				app={mockApp}
				card={mockCard}
				revealed={false}
				practiceMode={PracticeMode.CLOZE}
			/>
		);

		const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
		const submitButton = screen.getByText("Submit Answers");

		fireEvent.change(inputs[0], { target: { value: "H" } }); // Correct
		fireEvent.change(inputs[1], { target: { value: "X" } }); // Incorrect
		fireEvent.change(inputs[2], { target: { value: "C" } }); // Correct
		fireEvent.click(submitButton);

		expect(screen.getByText("Review the correct answers below:")).toBeInTheDocument();

		// Should show checkmark and X mark
		expect(screen.getAllByText("✓").length).toBe(2);
		expect(screen.getAllByText("✗").length).toBe(1);
	});
});

describe("FlashcardRenderer - Cloze-Deletion Mode - Edge Cases", () => {
	it("should handle cloze terms with special characters", () => {
		const card = createMockFlashcard(
			"card-special",
			"What is the formula?",
			"The formula is **H2O**."
		);

		render(
			<FlashcardRenderer
				app={mockApp}
				card={card}
				revealed={false}
				practiceMode={PracticeMode.CLOZE}
			/>
		);

		const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
		const submitButton = screen.getByText("Submit Answers");

		fireEvent.change(inputs[0], { target: { value: "H2O" } });
		fireEvent.click(submitButton);

		expect(screen.getByText("All correct! Well done!")).toBeInTheDocument();
	});

	it("should handle cloze terms with whitespace", () => {
		const card = createMockFlashcard(
			"card-whitespace",
			"What is the phrase?",
			"The phrase is **United States**."
		);

		render(
			<FlashcardRenderer
				app={mockApp}
				card={card}
				revealed={false}
				practiceMode={PracticeMode.CLOZE}
			/>
		);

		const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
		const submitButton = screen.getByText("Submit Answers");

		fireEvent.change(inputs[0], { target: { value: "United States" } });
		fireEvent.click(submitButton);

		expect(screen.getByText("All correct! Well done!")).toBeInTheDocument();
	});

	it("should handle empty flashcard back", () => {
		const card = createMockFlashcard(
			"card-empty",
			"What is this?",
			""
		);

		render(
			<FlashcardRenderer
				app={mockApp}
				card={card}
				revealed={false}
				practiceMode={PracticeMode.CLOZE}
			/>
		);

		expect(screen.getByText(/No cloze terms detected/i)).toBeInTheDocument();
	});
});

describe("FlashcardRenderer - Cloze-Deletion Mode - Callback", () => {
	it("should call onAnswerSubmit callback with user answers", () => {
		const mockCard = createMockFlashcard(
			"card-1",
			"What are the colors?",
			"The colors are **red** and **blue**."
		);

		const mockCallback = jest.fn();

		render(
			<FlashcardRenderer
				app={mockApp}
				card={mockCard}
				revealed={false}
				practiceMode={PracticeMode.CLOZE}
				onAnswerSubmit={mockCallback}
			/>
		);

		const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
		const submitButton = screen.getByText("Submit Answers");

		fireEvent.change(inputs[0], { target: { value: "red" } });
		fireEvent.change(inputs[1], { target: { value: "blue" } });
		fireEvent.click(submitButton);

		expect(mockCallback).toHaveBeenCalledWith("red, blue");
	});
});
