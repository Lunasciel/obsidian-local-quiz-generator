import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import DeckSelector from "./DeckSelector";
import { App } from "obsidian";
import { QuizSettings } from "../../settings/config";
import { Deck, DeckStats, MasteryLevel, PracticeMode } from "../../utils/types";
import DeckManager from "../../services/flashcards/deckManager";

// Mock the DeckManager module
jest.mock("../../services/flashcards/deckManager");

/**
 * Test suite for DeckSelector Component
 *
 * This test file covers all functionality of the DeckSelector component including:
 * - Deck listing and display
 * - Statistics rendering
 * - Deck creation
 * - Deck editing
 * - Deck deletion
 * - Error handling
 * - Empty states
 */
describe("DeckSelector Component", () => {
	let mockApp: App;
	let mockSettings: QuizSettings;
	let mockOnSelect: jest.Mock;
	let mockOnClose: jest.Mock;
	let mockOnDeckCreated: jest.Mock;
	let mockOnDeckDeleted: jest.Mock;
	let mockOnDeckEdited: jest.Mock;

	// Mock deck data for testing
	const mockDeck1: Deck = {
		id: "deck-1",
		name: "Biology 101",
		description: "Introduction to Biology",
		created: Date.now() - 86400000 * 30, // 30 days ago
		modified: Date.now() - 86400000 * 5, // 5 days ago
		cardIds: ["card-1", "card-2", "card-3"],
		sourceFolder: "Notes/Biology",
		settings: {
			newCardsPerDay: 20,
			reviewsPerDay: 100,
			enabledPracticeModes: [PracticeMode.STANDARD, PracticeMode.TYPE_ANSWER],
			enableAudioCues: false
		}
	};

	const mockDeck2: Deck = {
		id: "deck-2",
		name: "Math Fundamentals",
		description: "Basic math concepts",
		created: Date.now() - 86400000 * 60, // 60 days ago
		modified: Date.now() - 86400000 * 1, // 1 day ago
		cardIds: ["card-4", "card-5"],
		settings: {
			newCardsPerDay: 15,
			reviewsPerDay: 50,
			enabledPracticeModes: [PracticeMode.STANDARD],
			enableAudioCues: false
		}
	};

	const mockDeck3: Deck = {
		id: "deck-3",
		name: "Empty Deck",
		description: "Deck with no cards",
		created: Date.now() - 86400000 * 10,
		modified: Date.now() - 86400000 * 10,
		cardIds: [],
		settings: {
			newCardsPerDay: 20,
			reviewsPerDay: 100,
			enabledPracticeModes: [PracticeMode.STANDARD],
			enableAudioCues: false
		}
	};

	const mockStats1: DeckStats = {
		totalCards: 3,
		newCards: 1,
		learningCards: 1,
		masteredCards: 1,
		dueToday: 2,
		averageEaseFactor: 2.5,
		studyStreak: 5,
		lastReviewed: Date.now() - 86400000 * 2 // 2 days ago
	};

	const mockStats2: DeckStats = {
		totalCards: 2,
		newCards: 0,
		learningCards: 2,
		masteredCards: 0,
		dueToday: 0,
		averageEaseFactor: 2.3,
		studyStreak: 0,
		lastReviewed: Date.now() - 86400000 * 7 // 7 days ago
	};

	const mockStats3: DeckStats = {
		totalCards: 0,
		newCards: 0,
		learningCards: 0,
		masteredCards: 0,
		dueToday: 0,
		averageEaseFactor: 0,
		studyStreak: 0
	};

	beforeEach(() => {
		// Reset all mocks before each test
		jest.clearAllMocks();

		// Create mock objects
		mockApp = {} as App;
		mockSettings = {} as QuizSettings;
		mockOnSelect = jest.fn();
		mockOnClose = jest.fn();
		mockOnDeckCreated = jest.fn();
		mockOnDeckDeleted = jest.fn();
		mockOnDeckEdited = jest.fn();

		// Setup default DeckManager mock implementation
		const mockDeckManagerInstance = {
			getAllDecks: jest.fn().mockResolvedValue([mockDeck1, mockDeck2, mockDeck3]),
			getDeck: jest.fn((id: string) => {
				const decks = [mockDeck1, mockDeck2, mockDeck3];
				return Promise.resolve(decks.find(d => d.id === id) || null);
			}),
			getDeckStats: jest.fn((id: string) => {
				const statsMap: Record<string, DeckStats> = {
					"deck-1": mockStats1,
					"deck-2": mockStats2,
					"deck-3": mockStats3
				};
				return Promise.resolve(statsMap[id]);
			}),
			createDeck: jest.fn().mockResolvedValue({
				...mockDeck1,
				id: "new-deck",
				name: "New Deck",
				cardIds: []
			}),
			updateDeck: jest.fn().mockResolvedValue(undefined),
			deleteDeck: jest.fn().mockResolvedValue(undefined),
			addCardsToDeck: jest.fn().mockResolvedValue(undefined),
			removeCardsFromDeck: jest.fn().mockResolvedValue(undefined)
		};

		(DeckManager as jest.Mock).mockImplementation(() => mockDeckManagerInstance);
	});

	/**
	 * Test: Component renders and loads decks successfully
	 */
	it("should render and load decks successfully", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
				onClose={mockOnClose}
			/>
		);

		// Should show loading initially
		expect(screen.getByText("Loading decks...")).toBeInTheDocument();

		// Wait for decks to load
		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// All decks should be displayed
		expect(screen.getByText("Biology 101")).toBeInTheDocument();
		expect(screen.getByText("Math Fundamentals")).toBeInTheDocument();
		expect(screen.getByText("Empty Deck")).toBeInTheDocument();
	});

	/**
	 * Test: Deck statistics are displayed correctly
	 */
	it("should display deck statistics correctly", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Check if statistics are displayed (multiple decks, so use getAllByText)
		expect(screen.getAllByText(/Total Cards:/)[0]).toBeInTheDocument();
		expect(screen.getAllByText(/New:/)[0]).toBeInTheDocument();
		expect(screen.getAllByText(/Learning:/)[0]).toBeInTheDocument();
		expect(screen.getAllByText(/Mastered:/)[0]).toBeInTheDocument();
	});

	/**
	 * Test: Due cards badge is shown for decks with due cards
	 */
	it("should show due cards badge for decks with cards due", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Deck 1 has 2 cards due
		expect(screen.getByText("2 due")).toBeInTheDocument();
	});

	/**
	 * Test: Study streak is displayed when greater than 0
	 */
	it("should display study streak when present", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Deck 1 has a 5-day streak
		expect(screen.getByText("🔥 5 day streak")).toBeInTheDocument();
	});

	/**
	 * Test: Mastery percentage is calculated correctly
	 */
	it("should calculate and display mastery percentage", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Deck 1: 1 mastered / 3 total = 33%
		expect(screen.getByText(/Mastery: 33%/)).toBeInTheDocument();
	});

	/**
	 * Test: Clicking a deck triggers onSelect callback
	 */
	it("should call onSelect when deck is clicked", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Click the "Review" button for deck 1
		const reviewButtons = screen.getAllByText("Review");
		fireEvent.click(reviewButtons[0]);

		expect(mockOnSelect).toHaveBeenCalledWith("deck-1");
	});

	/**
	 * Test: Clicking deck header also triggers selection
	 */
	it("should call onSelect when deck header is clicked", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Click the deck name/header
		fireEvent.click(screen.getByText("Biology 101"));

		expect(mockOnSelect).toHaveBeenCalledWith("deck-1");
	});

	/**
	 * Test: Cannot select empty deck (no cards)
	 */
	it("should not allow selecting empty deck", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Empty Deck")).toBeInTheDocument();
		});

		// Find the review button for the empty deck (should be disabled)
		const reviewButtons = screen.getAllByText("Review");
		const emptyDeckButton = reviewButtons[2]; // Third deck

		expect(emptyDeckButton).toBeDisabled();
	});

	/**
	 * Test: Create new deck button shows create form
	 */
	it("should show create form when new deck button is clicked", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("+ New Deck")).toBeInTheDocument();
		});

		// Click new deck button
		fireEvent.click(screen.getByText("+ New Deck"));

		// Create form should be visible
		expect(screen.getByText("Create New Deck")).toBeInTheDocument();
		expect(screen.getByPlaceholderText("Enter deck name")).toBeInTheDocument();
	});

	/**
	 * Test: Creating a new deck
	 */
	it("should create a new deck successfully", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
				onDeckCreated={mockOnDeckCreated}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("+ New Deck")).toBeInTheDocument();
		});

		// Open create form
		fireEvent.click(screen.getByText("+ New Deck"));

		// Fill in the form
		fireEvent.change(screen.getByPlaceholderText("Enter deck name"), {
			target: { value: "New Test Deck" }
		});
		fireEvent.change(screen.getByPlaceholderText("Enter deck description"), {
			target: { value: "Test description" }
		});

		// Submit the form
		const createButtons = screen.getAllByText("Create");
		fireEvent.click(createButtons[0]);

		// Wait for deck creation
		await waitFor(() => {
			expect(mockOnDeckCreated).toHaveBeenCalled();
		});
	});

	/**
	 * Test: Cannot create deck with empty name
	 */
	it("should show error when creating deck with empty name", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("+ New Deck")).toBeInTheDocument();
		});

		// Open create form
		fireEvent.click(screen.getByText("+ New Deck"));

		// Try to create without name
		const createButtons = screen.getAllByText("Create");
		fireEvent.click(createButtons[0]);

		// Error should be shown
		await waitFor(() => {
			expect(screen.getByText("Deck name cannot be empty")).toBeInTheDocument();
		});
	});

	/**
	 * Test: Cancel button hides create form
	 */
	it("should hide create form when cancel is clicked", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("+ New Deck")).toBeInTheDocument();
		});

		// Open create form
		fireEvent.click(screen.getByText("+ New Deck"));
		expect(screen.getByText("Create New Deck")).toBeInTheDocument();

		// Cancel
		const cancelButtons = screen.getAllByText("Cancel");
		fireEvent.click(cancelButtons[0]);

		// Form should be hidden
		await waitFor(() => {
			expect(screen.queryByText("Create New Deck")).not.toBeInTheDocument();
		});
	});

	/**
	 * Test: Edit button shows edit form
	 */
	it("should show edit form when edit button is clicked", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Click edit button for first deck
		const editButtons = screen.getAllByText("Edit");
		fireEvent.click(editButtons[0]);

		// Edit form should be visible with current values
		expect(screen.getByDisplayValue("Biology 101")).toBeInTheDocument();
		expect(screen.getByDisplayValue("Introduction to Biology")).toBeInTheDocument();
	});

	/**
	 * Test: Saving edited deck
	 */
	it("should save deck edits successfully", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
				onDeckEdited={mockOnDeckEdited}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Start editing
		const editButtons = screen.getAllByText("Edit");
		fireEvent.click(editButtons[0]);

		// Change name
		const nameInput = screen.getByDisplayValue("Biology 101");
		fireEvent.change(nameInput, {
			target: { value: "Biology 101 Updated" }
		});

		// Save
		fireEvent.click(screen.getByText("Save"));

		// Wait for save to complete
		await waitFor(() => {
			expect(mockOnDeckEdited).toHaveBeenCalled();
		});
	});

	/**
	 * Test: Canceling deck edit
	 */
	it("should cancel deck edit and restore view", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Start editing
		const editButtons = screen.getAllByText("Edit");
		fireEvent.click(editButtons[0]);

		// Edit form should be visible
		expect(screen.getByDisplayValue("Biology 101")).toBeInTheDocument();

		// Cancel
		const cancelButtons = screen.getAllByText("Cancel");
		fireEvent.click(cancelButtons[0]);

		// Should return to normal view
		await waitFor(() => {
			expect(screen.queryByDisplayValue("Biology 101")).not.toBeInTheDocument();
		});
	});

	/**
	 * Test: Delete button shows confirmation
	 */
	it("should show delete confirmation when delete is clicked", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Click delete button
		const deleteButtons = screen.getAllByText("Delete");
		fireEvent.click(deleteButtons[0]);

		// Confirmation should be shown
		expect(screen.getByText(/Delete "Biology 101"\?/)).toBeInTheDocument();
		expect(screen.getByText(/This deck contains 3 card/)).toBeInTheDocument();
	});

	/**
	 * Test: Deleting a deck
	 */
	it("should delete deck when confirmed", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
				onDeckDeleted={mockOnDeckDeleted}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Start delete
		const deleteButtons = screen.getAllByText("Delete");
		fireEvent.click(deleteButtons[0]);

		// Wait for confirmation dialog to appear
		await waitFor(() => {
			expect(screen.getByText(/Delete "Biology 101"\?/)).toBeInTheDocument();
		});

		// Find and click the confirmation delete button
		const confirmButtons = screen.getAllByText("Delete");
		const confirmButton = confirmButtons.find(
			(button) => button.className.includes("deck-delete-confirm-button-qg")
		);

		if (confirmButton) {
			fireEvent.click(confirmButton);
		}

		// Wait for deletion
		await waitFor(() => {
			expect(mockOnDeckDeleted).toHaveBeenCalledWith("deck-1");
		}, { timeout: 3000 });
	});

	/**
	 * Test: Canceling deck deletion
	 */
	it("should cancel deck deletion", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Start delete
		const deleteButtons = screen.getAllByText("Delete");
		fireEvent.click(deleteButtons[0]);

		// Cancel
		const cancelButtons = screen.getAllByText("Cancel");
		fireEvent.click(cancelButtons[0]);

		// Confirmation should be hidden
		await waitFor(() => {
			expect(screen.queryByText(/Delete "Biology 101"\?/)).not.toBeInTheDocument();
		});
	});

	/**
	 * Test: Delete with cards checkbox
	 */
	it("should allow choosing to delete cards with deck", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Start delete
		const deleteButtons = screen.getAllByText("Delete");
		fireEvent.click(deleteButtons[0]);

		// Check the "also delete cards" checkbox
		const checkbox = screen.getByRole("checkbox");
		fireEvent.click(checkbox);

		expect(checkbox).toBeChecked();
	});

	/**
	 * Test: Deleting deck with cards option set to true
	 */
	it("should delete deck and cards when checkbox is checked", async () => {
		const mockDeleteDeck = jest.fn().mockResolvedValue(undefined);
		const mockDeckManagerInstance = {
			getAllDecks: jest.fn()
				.mockResolvedValueOnce([mockDeck1, mockDeck2, mockDeck3])
				.mockResolvedValueOnce([mockDeck2, mockDeck3]),
			getDeck: jest.fn((id: string) => {
				const decks = [mockDeck1, mockDeck2, mockDeck3];
				return Promise.resolve(decks.find(d => d.id === id) || null);
			}),
			getDeckStats: jest.fn((id: string) => {
				const statsMap: Record<string, DeckStats> = {
					"deck-1": mockStats1,
					"deck-2": mockStats2,
					"deck-3": mockStats3
				};
				return Promise.resolve(statsMap[id]);
			}),
			deleteDeck: mockDeleteDeck
		};

		(DeckManager as jest.Mock).mockImplementation(() => mockDeckManagerInstance);

		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
				onDeckDeleted={mockOnDeckDeleted}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Start delete
		const deleteButtons = screen.getAllByText("Delete");
		fireEvent.click(deleteButtons[0]);

		// Wait for confirmation dialog
		await waitFor(() => {
			expect(screen.getByText(/Delete "Biology 101"\?/)).toBeInTheDocument();
		});

		// Check the "also delete cards" checkbox
		const checkbox = screen.getByRole("checkbox");
		fireEvent.click(checkbox);

		// Confirm deletion
		const confirmButtons = screen.getAllByText("Delete");
		const confirmButton = confirmButtons.find(
			(button) => button.className.includes("deck-delete-confirm-button-qg")
		);

		if (confirmButton) {
			fireEvent.click(confirmButton);
		}

		// Wait for deletion to complete
		await waitFor(() => {
			expect(mockDeleteDeck).toHaveBeenCalledWith("deck-1", true);
		}, { timeout: 3000 });
	});

	/**
	 * Test: Deleting deck without deleting cards
	 */
	it("should delete deck without cards when checkbox is not checked", async () => {
		const mockDeleteDeck = jest.fn().mockResolvedValue(undefined);
		const mockDeckManagerInstance = {
			getAllDecks: jest.fn()
				.mockResolvedValueOnce([mockDeck1, mockDeck2, mockDeck3])
				.mockResolvedValueOnce([mockDeck2, mockDeck3]),
			getDeck: jest.fn((id: string) => {
				const decks = [mockDeck1, mockDeck2, mockDeck3];
				return Promise.resolve(decks.find(d => d.id === id) || null);
			}),
			getDeckStats: jest.fn((id: string) => {
				const statsMap: Record<string, DeckStats> = {
					"deck-1": mockStats1,
					"deck-2": mockStats2,
					"deck-3": mockStats3
				};
				return Promise.resolve(statsMap[id]);
			}),
			deleteDeck: mockDeleteDeck
		};

		(DeckManager as jest.Mock).mockImplementation(() => mockDeckManagerInstance);

		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
				onDeckDeleted={mockOnDeckDeleted}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Start delete
		const deleteButtons = screen.getAllByText("Delete");
		fireEvent.click(deleteButtons[0]);

		// Wait for confirmation dialog
		await waitFor(() => {
			expect(screen.getByText(/Delete "Biology 101"\?/)).toBeInTheDocument();
		});

		// Don't check the checkbox - leave it unchecked

		// Confirm deletion
		const confirmButtons = screen.getAllByText("Delete");
		const confirmButton = confirmButtons.find(
			(button) => button.className.includes("deck-delete-confirm-button-qg")
		);

		if (confirmButton) {
			fireEvent.click(confirmButton);
		}

		// Wait for deletion to complete
		await waitFor(() => {
			expect(mockDeleteDeck).toHaveBeenCalledWith("deck-1", false);
		}, { timeout: 3000 });
	});

	/**
	 * Test: Deleting empty deck shows appropriate message
	 */
	it("should show appropriate message when deleting empty deck", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Empty Deck")).toBeInTheDocument();
		});

		// Start delete for empty deck
		const deleteButtons = screen.getAllByText("Delete");
		fireEvent.click(deleteButtons[2]); // Third deck is empty

		// Should show confirmation without card count message
		await waitFor(() => {
			expect(screen.getByText(/Delete "Empty Deck"\?/)).toBeInTheDocument();
		});

		expect(screen.getByText("This action cannot be undone.")).toBeInTheDocument();
	});

	/**
	 * Test: Error handling during deletion
	 */
	it("should display error when deletion fails", async () => {
		const mockDeleteDeck = jest.fn().mockRejectedValue(new Error("Deletion failed"));
		const mockDeckManagerInstance = {
			getAllDecks: jest.fn().mockResolvedValue([mockDeck1, mockDeck2, mockDeck3]),
			getDeck: jest.fn((id: string) => {
				const decks = [mockDeck1, mockDeck2, mockDeck3];
				return Promise.resolve(decks.find(d => d.id === id) || null);
			}),
			getDeckStats: jest.fn((id: string) => {
				const statsMap: Record<string, DeckStats> = {
					"deck-1": mockStats1,
					"deck-2": mockStats2,
					"deck-3": mockStats3
				};
				return Promise.resolve(statsMap[id]);
			}),
			deleteDeck: mockDeleteDeck
		};

		(DeckManager as jest.Mock).mockImplementation(() => mockDeckManagerInstance);

		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Start delete
		const deleteButtons = screen.getAllByText("Delete");
		fireEvent.click(deleteButtons[0]);

		// Confirm deletion
		await waitFor(() => {
			expect(screen.getByText(/Delete "Biology 101"\?/)).toBeInTheDocument();
		});

		const confirmButtons = screen.getAllByText("Delete");
		const confirmButton = confirmButtons.find(
			(button) => button.className.includes("deck-delete-confirm-button-qg")
		);

		if (confirmButton) {
			fireEvent.click(confirmButton);
		}

		// Wait for error message
		await waitFor(() => {
			expect(screen.getByText("Deletion failed")).toBeInTheDocument();
		}, { timeout: 3000 });
	});

	/**
	 * Test: Multiple decks can be deleted in sequence
	 */
	it("should allow deleting multiple decks in sequence", async () => {
		const mockDeleteDeck = jest.fn().mockResolvedValue(undefined);
		const mockGetAllDecks = jest.fn()
			.mockResolvedValueOnce([mockDeck1, mockDeck2, mockDeck3]) // Initial load
			.mockResolvedValueOnce([mockDeck2, mockDeck3]) // After first deletion
			.mockResolvedValueOnce([mockDeck3]); // After second deletion

		const mockDeckManagerInstance = {
			getAllDecks: mockGetAllDecks,
			getDeck: jest.fn((id: string) => {
				const decks = [mockDeck1, mockDeck2, mockDeck3];
				return Promise.resolve(decks.find(d => d.id === id) || null);
			}),
			getDeckStats: jest.fn((id: string) => {
				const statsMap: Record<string, DeckStats> = {
					"deck-1": mockStats1,
					"deck-2": mockStats2,
					"deck-3": mockStats3
				};
				return Promise.resolve(statsMap[id]);
			}),
			deleteDeck: mockDeleteDeck
		};

		(DeckManager as jest.Mock).mockImplementation(() => mockDeckManagerInstance);

		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
				onDeckDeleted={mockOnDeckDeleted}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Delete first deck
		const deleteButtons1 = screen.getAllByText("Delete");
		fireEvent.click(deleteButtons1[0]);

		await waitFor(() => {
			expect(screen.getByText(/Delete "Biology 101"\?/)).toBeInTheDocument();
		});

		const confirmButtons1 = screen.getAllByText("Delete");
		const confirmButton1 = confirmButtons1.find(
			(button) => button.className.includes("deck-delete-confirm-button-qg")
		);

		if (confirmButton1) {
			fireEvent.click(confirmButton1);
		}

		await waitFor(() => {
			expect(mockDeleteDeck).toHaveBeenCalledWith("deck-1", false);
		}, { timeout: 3000 });

		// Wait for UI to update
		await waitFor(() => {
			expect(screen.queryByText("Biology 101")).not.toBeInTheDocument();
		}, { timeout: 3000 });

		// Verify that the first deck was deleted
		expect(mockDeleteDeck).toHaveBeenCalledTimes(1);
	});

	/**
	 * Test: Empty state is shown when no decks exist
	 */
	it("should show empty state when no decks exist", async () => {
		// Mock empty deck list
		const mockEmptyDeckManager = {
			getAllDecks: jest.fn().mockResolvedValue([]),
			getDeckStats: jest.fn().mockResolvedValue(mockStats3)
		};
		(DeckManager as jest.Mock).mockImplementation(() => mockEmptyDeckManager);

		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("No decks found. Create your first deck to get started!")).toBeInTheDocument();
		});

		// Create button should be visible
		expect(screen.getByText("Create Your First Deck")).toBeInTheDocument();
	});

	/**
	 * Test: Error handling when loading decks fails
	 */
	it("should display error when deck loading fails", async () => {
		// Mock error
		const mockErrorDeckManager = {
			getAllDecks: jest.fn().mockRejectedValue(new Error("Failed to load")),
			getDeckStats: jest.fn().mockResolvedValue(mockStats1)
		};
		(DeckManager as jest.Mock).mockImplementation(() => mockErrorDeckManager);

		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Failed to load decks. Please try again.")).toBeInTheDocument();
		});
	});

	/**
	 * Test: Error can be dismissed
	 */
	it("should allow dismissing error messages", async () => {
		// Mock error
		const mockErrorDeckManager = {
			getAllDecks: jest.fn().mockRejectedValue(new Error("Failed to load")),
			getDeckStats: jest.fn().mockResolvedValue(mockStats1)
		};
		(DeckManager as jest.Mock).mockImplementation(() => mockErrorDeckManager);

		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Failed to load decks. Please try again.")).toBeInTheDocument();
		});

		// Dismiss error
		const dismissButton = screen.getByText("×");
		fireEvent.click(dismissButton);

		await waitFor(() => {
			expect(screen.queryByText("Failed to load decks. Please try again.")).not.toBeInTheDocument();
		});
	});

	/**
	 * Test: Deck descriptions are displayed
	 */
	it("should display deck descriptions", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Introduction to Biology")).toBeInTheDocument();
		});

		expect(screen.getByText("Basic math concepts")).toBeInTheDocument();
	});

	/**
	 * Test: Source folder is displayed when present
	 */
	it("should display source folder when present", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("📁 Notes/Biology")).toBeInTheDocument();
		});
	});

	/**
	 * Test: Created date is displayed
	 */
	it("should display deck created date", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getAllByText(/Created:/)[0]).toBeInTheDocument();
		}, { timeout: 3000 });
	});

	/**
	 * Test: Deck settings are displayed in edit form
	 */
	it("should show deck settings when editing a deck", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
				onDeckEdited={mockOnDeckEdited}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Click edit button for first deck
		const editButtons = screen.getAllByText("Edit");
		fireEvent.click(editButtons[0]);

		// Wait for edit form to appear
		await waitFor(() => {
			expect(screen.getByText("Deck Settings")).toBeInTheDocument();
		});

		// Check if settings fields are present
		expect(screen.getByText("New Cards Per Day")).toBeInTheDocument();
		expect(screen.getByText("Reviews Per Day")).toBeInTheDocument();
		expect(screen.getByText("Enabled Practice Modes")).toBeInTheDocument();
		expect(screen.getByText("Enable Audio Cues")).toBeInTheDocument();

		// Check if practice mode checkboxes are present
		expect(screen.getByText("Standard")).toBeInTheDocument();
		expect(screen.getByText("Type Answer")).toBeInTheDocument();
		expect(screen.getByText("Multiple Choice")).toBeInTheDocument();
		expect(screen.getByText("Cloze Deletion")).toBeInTheDocument();
	});

	/**
	 * Test: Deck settings are pre-populated with existing values in edit form
	 */
	it("should pre-populate deck settings when editing", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
				onDeckEdited={mockOnDeckEdited}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Click edit button for first deck
		const editButtons = screen.getAllByText("Edit");
		fireEvent.click(editButtons[0]);

		await waitFor(() => {
			expect(screen.getByText("Deck Settings")).toBeInTheDocument();
		});

		// Get input fields
		const newCardsInput = screen.getByLabelText("New Cards Per Day") as HTMLInputElement;
		const reviewsInput = screen.getByLabelText("Reviews Per Day") as HTMLInputElement;

		// Check pre-populated values from mockDeck1
		expect(newCardsInput.value).toBe("20");
		expect(reviewsInput.value).toBe("100");

		// Check practice modes are pre-selected correctly
		const practiceModeCheckboxes = screen.getAllByRole("checkbox");
		// Find Standard and Type Answer checkboxes (should be checked)
		const standardCheckbox = practiceModeCheckboxes.find(
			cb => cb.nextSibling?.textContent === "Standard"
		) as HTMLInputElement;
		const typeAnswerCheckbox = practiceModeCheckboxes.find(
			cb => cb.nextSibling?.textContent === "Type Answer"
		) as HTMLInputElement;

		expect(standardCheckbox?.checked).toBe(true);
		expect(typeAnswerCheckbox?.checked).toBe(true);
	});

	/**
	 * Test: Deck settings can be modified in edit form
	 */
	it("should allow modifying deck settings and save them", async () => {
		const mockUpdateDeck = jest.fn().mockResolvedValue(undefined);
		const mockDeckManagerInstance = {
			getAllDecks: jest.fn().mockResolvedValue([mockDeck1]),
			getDeck: jest.fn().mockResolvedValue(mockDeck1),
			getDeckStats: jest.fn().mockResolvedValue(mockStats1),
			updateDeck: mockUpdateDeck
		};

		(DeckManager as jest.Mock).mockImplementation(() => mockDeckManagerInstance);

		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
				onDeckEdited={mockOnDeckEdited}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Click edit button
		const editButton = screen.getByText("Edit");
		fireEvent.click(editButton);

		await waitFor(() => {
			expect(screen.getByText("Deck Settings")).toBeInTheDocument();
		});

		// Modify settings
		const newCardsInput = screen.getByLabelText("New Cards Per Day") as HTMLInputElement;
		const reviewsInput = screen.getByLabelText("Reviews Per Day") as HTMLInputElement;

		fireEvent.change(newCardsInput, { target: { value: "30" } });
		fireEvent.change(reviewsInput, { target: { value: "150" } });

		// Click save button
		const saveButton = screen.getByText("Save");
		fireEvent.click(saveButton);

		// Wait for update to complete
		await waitFor(() => {
			expect(mockUpdateDeck).toHaveBeenCalled();
		});

		// Check that updateDeck was called with modified settings
		const updatedDeck = mockUpdateDeck.mock.calls[0][0];
		expect(updatedDeck.settings.newCardsPerDay).toBe(30);
		expect(updatedDeck.settings.reviewsPerDay).toBe(150);
	});

	/**
	 * Test: Deck settings are shown in create form
	 */
	it("should show deck settings in create form", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
				onDeckCreated={mockOnDeckCreated}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Select a Deck")).toBeInTheDocument();
		});

		// Click new deck button
		const newDeckButton = screen.getByText("+ New Deck");
		fireEvent.click(newDeckButton);

		await waitFor(() => {
			expect(screen.getByText("Create New Deck")).toBeInTheDocument();
		});

		// Check if settings fields are present
		expect(screen.getByText("Deck Settings")).toBeInTheDocument();
		expect(screen.getByText("New Cards Per Day")).toBeInTheDocument();
		expect(screen.getByText("Reviews Per Day")).toBeInTheDocument();
		expect(screen.getByText("Enabled Practice Modes")).toBeInTheDocument();
		expect(screen.getByText("Enable Audio Cues")).toBeInTheDocument();
	});

	/**
	 * Test: Can toggle practice modes when creating a deck
	 */
	it("should allow toggling practice modes in create form", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
				onDeckCreated={mockOnDeckCreated}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Select a Deck")).toBeInTheDocument();
		});

		// Click new deck button
		const newDeckButton = screen.getByText("+ New Deck");
		fireEvent.click(newDeckButton);

		await waitFor(() => {
			expect(screen.getByText("Create New Deck")).toBeInTheDocument();
		});

		// Get practice mode checkboxes
		const checkboxes = screen.getAllByRole("checkbox");
		const multipleChoiceCheckbox = checkboxes.find(
			cb => cb.nextSibling?.textContent === "Multiple Choice"
		) as HTMLInputElement;

		// Initially should not be checked (not in default enabled modes)
		const initiallyChecked = multipleChoiceCheckbox.checked;

		// Toggle it
		fireEvent.click(multipleChoiceCheckbox);

		// Should be toggled
		expect(multipleChoiceCheckbox.checked).toBe(!initiallyChecked);
	});

	/**
	 * Test: Deck settings are saved when creating a new deck
	 */
	it("should save deck settings when creating a new deck", async () => {
		const mockCreateDeck = jest.fn().mockResolvedValue({
			id: "new-deck",
			name: "Test Deck",
			description: "Test Description",
			created: Date.now(),
			modified: Date.now(),
			cardIds: [],
			settings: {
				newCardsPerDay: 20,
				reviewsPerDay: 100,
				enabledPracticeModes: [PracticeMode.STANDARD],
				enableAudioCues: false
			}
		});
		const mockUpdateDeck = jest.fn().mockResolvedValue(undefined);

		const mockDeckManagerInstance = {
			getAllDecks: jest.fn().mockResolvedValue([]),
			createDeck: mockCreateDeck,
			updateDeck: mockUpdateDeck,
			getDeckStats: jest.fn().mockResolvedValue(mockStats3)
		};

		(DeckManager as jest.Mock).mockImplementation(() => mockDeckManagerInstance);

		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
				onDeckCreated={mockOnDeckCreated}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("No decks found. Create your first deck to get started!")).toBeInTheDocument();
		});

		// Click create first deck button
		const createButton = screen.getByText("Create Your First Deck");
		fireEvent.click(createButton);

		await waitFor(() => {
			expect(screen.getByText("Create New Deck")).toBeInTheDocument();
		});

		// Fill in deck details
		const nameInput = screen.getByPlaceholderText("Enter deck name");
		fireEvent.change(nameInput, { target: { value: "Test Deck" } });

		// Modify settings
		const newCardsInput = screen.getByLabelText("New Cards Per Day") as HTMLInputElement;
		fireEvent.change(newCardsInput, { target: { value: "25" } });

		// Click create button
		const createDeckButton = screen.getByText("Create");
		fireEvent.click(createDeckButton);

		// Wait for deck to be created
		await waitFor(() => {
			expect(mockCreateDeck).toHaveBeenCalled();
		});

		// Check that updateDeck was called with custom settings
		await waitFor(() => {
			expect(mockUpdateDeck).toHaveBeenCalled();
		});

		const updatedDeck = mockUpdateDeck.mock.calls[0][0];
		expect(updatedDeck.settings.newCardsPerDay).toBe(25);
	});

	/**
	 * Test: Can toggle audio cues setting
	 */
	it("should allow toggling audio cues setting", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
				onDeckEdited={mockOnDeckEdited}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Click edit button
		const editButton = screen.getAllByText("Edit")[0];
		fireEvent.click(editButton);

		await waitFor(() => {
			expect(screen.getByText("Deck Settings")).toBeInTheDocument();
		});

		// Find audio cues checkbox
		const checkboxes = screen.getAllByRole("checkbox");
		const audioCuesCheckbox = checkboxes.find(
			cb => cb.nextSibling?.textContent === "Enable Audio Cues"
		) as HTMLInputElement;

		expect(audioCuesCheckbox).toBeDefined();

		// Initially should be false (from mockDeck1)
		expect(audioCuesCheckbox.checked).toBe(false);

		// Toggle it
		fireEvent.click(audioCuesCheckbox);

		// Should now be checked
		expect(audioCuesCheckbox.checked).toBe(true);
	});

	/**
	 * Test: Last reviewed date is displayed for decks with review history
	 */
	it("should display last reviewed date when available", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Should show "Last reviewed" for deck 1
		expect(screen.getAllByText(/Last reviewed:/)[0]).toBeInTheDocument();
	});

	/**
	 * Test: Search functionality filters decks by name
	 */
	it("should filter decks by name using search", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Enter search query
		const searchInput = screen.getByPlaceholderText("Search by name, description, or source...");
		fireEvent.change(searchInput, { target: { value: "Biology" } });

		// Biology deck should still be visible
		expect(screen.getByText("Biology 101")).toBeInTheDocument();

		// Math deck should be filtered out
		await waitFor(() => {
			expect(screen.queryByText("Math Fundamentals")).not.toBeInTheDocument();
		});
	});

	/**
	 * Test: Search functionality filters decks by description
	 */
	it("should filter decks by description using search", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Search for "math" (in description of Math deck)
		const searchInput = screen.getByPlaceholderText("Search by name, description, or source...");
		fireEvent.change(searchInput, { target: { value: "math" } });

		// Math deck should be visible
		expect(screen.getByText("Math Fundamentals")).toBeInTheDocument();

		// Biology deck should be filtered out
		await waitFor(() => {
			expect(screen.queryByText("Biology 101")).not.toBeInTheDocument();
		});
	});

	/**
	 * Test: Search clear button works
	 */
	it("should clear search when clear button is clicked", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Enter search query
		const searchInput = screen.getByPlaceholderText("Search by name, description, or source...");
		fireEvent.change(searchInput, { target: { value: "Biology" } });

		// Clear search
		const clearButton = screen.getByTitle("Clear search");
		fireEvent.click(clearButton);

		// All decks should be visible again
		expect(screen.getByText("Biology 101")).toBeInTheDocument();
		expect(screen.getByText("Math Fundamentals")).toBeInTheDocument();
	});

	/**
	 * Test: Filter by source folder
	 */
	it("should filter decks by source folder", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Select source filter
		const sourceFilter = screen.getByLabelText("Source:");
		fireEvent.change(sourceFilter, { target: { value: "Notes/Biology" } });

		// Biology deck should be visible
		expect(screen.getByText("Biology 101")).toBeInTheDocument();

		// Math deck (no source folder) should be filtered out
		await waitFor(() => {
			expect(screen.queryByText("Math Fundamentals")).not.toBeInTheDocument();
		});
	});

	/**
	 * Test: Sort by name ascending
	 */
	it("should sort decks by name in ascending order", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Change sort to name
		const sortBySelect = screen.getByLabelText("Sort by:");
		fireEvent.change(sortBySelect, { target: { value: "name" } });

		// Get all deck names in order
		const deckNames = screen.getAllByClassName("deck-name-qg");
		expect(deckNames[0].textContent).toBe("Biology 101");
		expect(deckNames[1].textContent).toBe("Empty Deck");
		expect(deckNames[2].textContent).toBe("Math Fundamentals");
	});

	/**
	 * Test: Sort by card count
	 */
	it("should sort decks by card count", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Change sort to card count
		const sortBySelect = screen.getByLabelText("Sort by:");
		fireEvent.change(sortBySelect, { target: { value: "cardCount" } });

		// Empty deck (0 cards) should be first
		const deckNames = screen.getAllByClassName("deck-name-qg");
		expect(deckNames[0].textContent).toBe("Empty Deck");
	});

	/**
	 * Test: Toggle sort order
	 */
	it("should toggle sort order when sort order button is clicked", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Click sort order button to toggle to descending
		const sortOrderButton = screen.getByTitle("Sort descending");
		fireEvent.click(sortOrderButton);

		// Button title should change
		expect(screen.getByTitle("Sort ascending")).toBeInTheDocument();
	});

	/**
	 * Test: Batch mode can be toggled
	 */
	it("should toggle batch selection mode", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Enter batch mode
		const batchButton = screen.getByText("Batch Select");
		fireEvent.click(batchButton);

		// Button should change to "Exit Batch"
		expect(screen.getByText("Exit Batch")).toBeInTheDocument();

		// Checkboxes should be visible for each deck
		const checkboxes = screen.getAllByClassName("deck-batch-checkbox-qg");
		expect(checkboxes.length).toBeGreaterThan(0);
	});

	/**
	 * Test: Decks can be selected in batch mode
	 */
	it("should allow selecting decks in batch mode", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Enter batch mode
		const batchButton = screen.getByText("Batch Select");
		fireEvent.click(batchButton);

		// Select first deck
		const checkboxes = screen.getAllByClassName("deck-batch-checkbox-qg");
		fireEvent.click(checkboxes[0]);

		// Batch toolbar should appear with selection info
		await waitFor(() => {
			expect(screen.getByText("1 deck selected")).toBeInTheDocument();
		});
	});

	/**
	 * Test: Select all decks works
	 */
	it("should select all visible decks when select all is clicked", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Enter batch mode
		const batchButton = screen.getByText("Batch Select");
		fireEvent.click(batchButton);

		// Select one deck first
		const checkboxes = screen.getAllByClassName("deck-batch-checkbox-qg");
		fireEvent.click(checkboxes[0]);

		// Click select all
		const selectAllButton = screen.getByText("Select All");
		fireEvent.click(selectAllButton);

		// Should show 3 decks selected
		await waitFor(() => {
			expect(screen.getByText("3 decks selected")).toBeInTheDocument();
		});
	});

	/**
	 * Test: Deselect all works
	 */
	it("should deselect all decks when deselect all is clicked", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Enter batch mode
		const batchButton = screen.getByText("Batch Select");
		fireEvent.click(batchButton);

		// Select all decks
		const selectAllButton = screen.getByText("Select All");
		fireEvent.click(selectAllButton);

		await waitFor(() => {
			expect(screen.getByText("3 decks selected")).toBeInTheDocument();
		});

		// Deselect all
		const deselectAllButton = screen.getByText("Deselect All");
		fireEvent.click(deselectAllButton);

		// Batch toolbar should disappear (no selections)
		await waitFor(() => {
			expect(screen.queryByText("3 decks selected")).not.toBeInTheDocument();
		});
	});

	/**
	 * Test: Batch archive operation
	 */
	it("should archive selected decks in batch mode", async () => {
		const mockArchiveDeck = jest.fn().mockResolvedValue(undefined);
		const mockDeckManagerInstance = {
			getAllDecks: jest.fn().mockResolvedValue([mockDeck1, mockDeck2, mockDeck3]),
			getDeck: jest.fn((id: string) => {
				const decks = [mockDeck1, mockDeck2, mockDeck3];
				return Promise.resolve(decks.find(d => d.id === id) || null);
			}),
			getDeckStats: jest.fn((id: string) => {
				const statsMap: Record<string, DeckStats> = {
					"deck-1": mockStats1,
					"deck-2": mockStats2,
					"deck-3": mockStats3
				};
				return Promise.resolve(statsMap[id]);
			}),
			archiveDeck: mockArchiveDeck
		};

		(DeckManager as jest.Mock).mockImplementation(() => mockDeckManagerInstance);

		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Enter batch mode
		const batchButton = screen.getByText("Batch Select");
		fireEvent.click(batchButton);

		// Select first two decks
		const checkboxes = screen.getAllByClassName("deck-batch-checkbox-qg");
		fireEvent.click(checkboxes[0]);
		fireEvent.click(checkboxes[1]);

		await waitFor(() => {
			expect(screen.getByText("2 decks selected")).toBeInTheDocument();
		});

		// Click archive button
		const archiveButton = screen.getByText("Archive");
		fireEvent.click(archiveButton);

		// Should call archiveDeck for both selected decks
		await waitFor(() => {
			expect(mockArchiveDeck).toHaveBeenCalledTimes(2);
		});
	});

	/**
	 * Test: Batch delete operation with confirmation
	 */
	it("should delete selected decks in batch mode after confirmation", async () => {
		const mockDeleteDeck = jest.fn().mockResolvedValue(undefined);
		const mockDeckManagerInstance = {
			getAllDecks: jest.fn().mockResolvedValue([mockDeck1, mockDeck2, mockDeck3]),
			getDeck: jest.fn((id: string) => {
				const decks = [mockDeck1, mockDeck2, mockDeck3];
				return Promise.resolve(decks.find(d => d.id === id) || null);
			}),
			getDeckStats: jest.fn((id: string) => {
				const statsMap: Record<string, DeckStats> = {
					"deck-1": mockStats1,
					"deck-2": mockStats2,
					"deck-3": mockStats3
				};
				return Promise.resolve(statsMap[id]);
			}),
			deleteDeck: mockDeleteDeck
		};

		(DeckManager as jest.Mock).mockImplementation(() => mockDeckManagerInstance);

		// Mock confirm dialog
		global.confirm = jest.fn(() => true);

		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Enter batch mode
		const batchButton = screen.getByText("Batch Select");
		fireEvent.click(batchButton);

		// Select first deck
		const checkboxes = screen.getAllByClassName("deck-batch-checkbox-qg");
		fireEvent.click(checkboxes[0]);

		await waitFor(() => {
			expect(screen.getByText("1 deck selected")).toBeInTheDocument();
		});

		// Click delete button
		const deleteButton = screen.getByText("Delete");
		fireEvent.click(deleteButton);

		// Should show confirmation
		expect(global.confirm).toHaveBeenCalledWith(
			expect.stringContaining("Are you sure you want to delete 1 deck?")
		);

		// Should call deleteDeck
		await waitFor(() => {
			expect(mockDeleteDeck).toHaveBeenCalledWith("deck-1", false);
		});
	});

	/**
	 * Test: Batch delete cancelled when user declines confirmation
	 */
	it("should not delete decks when batch delete is cancelled", async () => {
		const mockDeleteDeck = jest.fn().mockResolvedValue(undefined);
		const mockDeckManagerInstance = {
			getAllDecks: jest.fn().mockResolvedValue([mockDeck1, mockDeck2, mockDeck3]),
			getDeck: jest.fn((id: string) => {
				const decks = [mockDeck1, mockDeck2, mockDeck3];
				return Promise.resolve(decks.find(d => d.id === id) || null);
			}),
			getDeckStats: jest.fn((id: string) => {
				const statsMap: Record<string, DeckStats> = {
					"deck-1": mockStats1,
					"deck-2": mockStats2,
					"deck-3": mockStats3
				};
				return Promise.resolve(statsMap[id]);
			}),
			deleteDeck: mockDeleteDeck
		};

		(DeckManager as jest.Mock).mockImplementation(() => mockDeckManagerInstance);

		// Mock confirm dialog to return false (cancelled)
		global.confirm = jest.fn(() => false);

		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Enter batch mode
		const batchButton = screen.getByText("Batch Select");
		fireEvent.click(batchButton);

		// Select first deck
		const checkboxes = screen.getAllByClassName("deck-batch-checkbox-qg");
		fireEvent.click(checkboxes[0]);

		await waitFor(() => {
			expect(screen.getByText("1 deck selected")).toBeInTheDocument();
		});

		// Click delete button
		const deleteButton = screen.getByText("Delete");
		fireEvent.click(deleteButton);

		// Should NOT call deleteDeck since confirmation was cancelled
		await waitFor(() => {
			expect(mockDeleteDeck).not.toHaveBeenCalled();
		}, { timeout: 1000 });
	});

	/**
	 * Test: Exiting batch mode clears selections
	 */
	it("should clear selections when exiting batch mode", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Enter batch mode
		const batchButton = screen.getByText("Batch Select");
		fireEvent.click(batchButton);

		// Select a deck
		const checkboxes = screen.getAllByClassName("deck-batch-checkbox-qg");
		fireEvent.click(checkboxes[0]);

		await waitFor(() => {
			expect(screen.getByText("1 deck selected")).toBeInTheDocument();
		});

		// Exit batch mode
		const exitBatchButton = screen.getByText("Exit Batch");
		fireEvent.click(exitBatchButton);

		// Checkboxes should be gone
		await waitFor(() => {
			expect(screen.queryByClassName("deck-batch-checkbox-qg")).not.toBeInTheDocument();
		});

		// Selection info should be gone
		expect(screen.queryByText("1 deck selected")).not.toBeInTheDocument();
	});

	/**
	 * Test: Empty state with filters active shows clear button
	 */
	it("should show clear filters button when no results match filters", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Search for something that doesn't exist
		const searchInput = screen.getByPlaceholderText("Search by name, description, or source...");
		fireEvent.change(searchInput, { target: { value: "nonexistent" } });

		// Should show empty state
		await waitFor(() => {
			expect(screen.getByText("No decks match your filters.")).toBeInTheDocument();
		});

		// Should show clear filters button
		expect(screen.getByText("Clear Filters")).toBeInTheDocument();
	});

	/**
	 * Test: Clear filters button resets all filters
	 */
	it("should reset all filters when clear filters button is clicked", async () => {
		render(
			<DeckSelector
				app={mockApp}
				settings={mockSettings}
				onSelect={mockOnSelect}
			/>
		);

		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});

		// Apply search and source filter
		const searchInput = screen.getByPlaceholderText("Search by name, description, or source...");
		fireEvent.change(searchInput, { target: { value: "nonexistent" } });

		const sourceFilter = screen.getByLabelText("Source:");
		fireEvent.change(sourceFilter, { target: { value: "Notes/Biology" } });

		// Should show empty state
		await waitFor(() => {
			expect(screen.getByText("No decks match your filters.")).toBeInTheDocument();
		});

		// Click clear filters
		const clearButton = screen.getByText("Clear Filters");
		fireEvent.click(clearButton);

		// All decks should be visible again
		await waitFor(() => {
			expect(screen.getByText("Biology 101")).toBeInTheDocument();
		});
		expect(screen.getByText("Math Fundamentals")).toBeInTheDocument();
	});
});
