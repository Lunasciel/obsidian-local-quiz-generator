import { App } from "obsidian";
import { useState, useEffect } from "react";
import { QuizSettings } from "../../settings/config";
import { Deck, DeckStats, MasteryLevel, PracticeMode, DeckSettings } from "../../utils/types";
import DeckManager, { SplitCriteria, SplitConfig } from "../../services/flashcards/deckManager";
import ModalButton from "../components/ModalButton";
import { DEFAULT_FLASHCARD_SETTINGS } from "../../settings/flashcards/flashcardConfig";
import SuggestionService from "../../services/flashcards/suggestionService";

/**
 * Props for the DeckSelector component
 */
interface DeckSelectorProps {
	/**
	 * The Obsidian App instance
	 */
	app: App;

	/**
	 * Plugin settings
	 */
	settings: QuizSettings;

	/**
	 * Callback when a deck is selected for review
	 * @param deckId - The ID of the selected deck
	 */
	onSelect: (deckId: string) => void;

	/**
	 * Callback when the deck selector is closed
	 */
	onClose?: () => void;

	/**
	 * Callback when a new deck is created
	 * @param deck - The newly created deck
	 */
	onDeckCreated?: (deck: Deck) => void;

	/**
	 * Callback when a deck is deleted
	 * @param deckId - The ID of the deleted deck
	 */
	onDeckDeleted?: (deckId: string) => void;

	/**
	 * Callback when a deck is edited/updated
	 * @param deck - The updated deck
	 */
	onDeckEdited?: (deck: Deck) => void;
}

/**
 * DeckSelector Component
 *
 * Modal component for selecting and managing flashcard decks. Displays all available
 * decks with statistics, allows creating new decks, and provides options to edit/delete.
 *
 * Features:
 * - Display list of all decks with card counts and due card counts
 * - Show mastery progress for each deck (new, learning, mastered cards)
 * - Create new deck functionality
 * - Edit deck name and settings
 * - Delete deck with confirmation
 * - Visual indicators for decks with due cards
 * - Responsive layout following Obsidian patterns
 *
 * Requirements addressed:
 * - Requirement 9.2: Display all decks with card counts and due card counts
 * - Requirement 9.3: Start review session with only cards from selected deck
 * - Requirement 9.5: Show metadata including creation date, total cards, next review date
 * - Requirement 6.3: Display mastery progress
 *
 * Usage:
 * ```tsx
 * <DeckSelector
 *   app={app}
 *   settings={settings}
 *   onSelect={(deckId) => startReviewSession(deckId)}
 *   onClose={() => modal.close()}
 * />
 * ```
 *
 * @param props - The component props
 * @returns A rendered deck selector element
 */
const DeckSelector = ({
	app,
	settings,
	onSelect,
	onClose,
	onDeckCreated,
	onDeckDeleted,
	onDeckEdited
}: DeckSelectorProps) => {
	// State for decks and their statistics
	const [decks, setDecks] = useState<Deck[]>([]);
	const [deckStats, setDeckStats] = useState<Map<string, DeckStats>>(new Map());
	const [isLoading, setIsLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | null>(null);

	// State for creating a new deck
	const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
	const [newDeckName, setNewDeckName] = useState<string>("");
	const [newDeckDescription, setNewDeckDescription] = useState<string>("");
	const [newDeckFolder, setNewDeckFolder] = useState<string>("");
	const [newDeckSettings, setNewDeckSettings] = useState<DeckSettings>({
		newCardsPerDay: DEFAULT_FLASHCARD_SETTINGS.defaultNewCardsPerDay,
		reviewsPerDay: DEFAULT_FLASHCARD_SETTINGS.defaultReviewsPerDay,
		enabledPracticeModes: DEFAULT_FLASHCARD_SETTINGS.defaultEnabledPracticeModes,
		enableAudioCues: DEFAULT_FLASHCARD_SETTINGS.defaultEnableAudioCues
	});
	const [createError, setCreateError] = useState<string | null>(null);

	// State for editing a deck
	const [editingDeckId, setEditingDeckId] = useState<string | null>(null);
	const [editDeckName, setEditDeckName] = useState<string>("");
	const [editDeckDescription, setEditDeckDescription] = useState<string>("");
	const [editDeckSettings, setEditDeckSettings] = useState<DeckSettings>({
		newCardsPerDay: DEFAULT_FLASHCARD_SETTINGS.defaultNewCardsPerDay,
		reviewsPerDay: DEFAULT_FLASHCARD_SETTINGS.defaultReviewsPerDay,
		enabledPracticeModes: DEFAULT_FLASHCARD_SETTINGS.defaultEnabledPracticeModes,
		enableAudioCues: DEFAULT_FLASHCARD_SETTINGS.defaultEnableAudioCues
	});

	// State for delete confirmation
	const [deletingDeckId, setDeletingDeckId] = useState<string | null>(null);
	const [deleteWithCards, setDeleteWithCards] = useState<boolean>(false);

	// State for deck merging
	const [showMergeModal, setShowMergeModal] = useState<boolean>(false);
	const [mergeTargetDeckId, setMergeTargetDeckId] = useState<string | null>(null);
	const [mergeSourceDeckIds, setMergeSourceDeckIds] = useState<Set<string>>(new Set());
	const [mergeError, setMergeError] = useState<string | null>(null);

	// State for deck splitting
	const [showSplitModal, setShowSplitModal] = useState<boolean>(false);
	const [splitDeckId, setSplitDeckId] = useState<string | null>(null);
	const [splitCriteria, setSplitCriteria] = useState<SplitCriteria>(SplitCriteria.MASTERY);
	const [splitError, setSplitError] = useState<string | null>(null);

	// State for showing archived decks
	const [showArchived, setShowArchived] = useState<boolean>(false);

	// State for search and filter (Requirement 7.4, 7.5)
	const [searchQuery, setSearchQuery] = useState<string>("");
	const [filterBySource, setFilterBySource] = useState<string>("all");
	const [sortBy, setSortBy] = useState<"name" | "date" | "cardCount" | "dueCards">("name");
	const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

	// State for batch selection (Requirement 7.4, 7.6)
	const [selectedDeckIds, setSelectedDeckIds] = useState<Set<string>>(new Set());
	const [batchMode, setBatchMode] = useState<boolean>(false);

	// Mastery-based split configuration
	const [masteryGroups, setMasteryGroups] = useState<{ deckName: string; levels: MasteryLevel[] }[]>([
		{ deckName: "New Cards", levels: [MasteryLevel.NEW] },
		{ deckName: "Learning Cards", levels: [MasteryLevel.LEARNING] },
		{ deckName: "Mastered Cards", levels: [MasteryLevel.MASTERED] }
	]);

	// Difficulty-based split configuration
	const [difficultyThresholds, setDifficultyThresholds] = useState<{ deckName: string; minEase: number; maxEase: number }[]>([
		{ deckName: "Difficult Cards", minEase: 0, maxEase: 2.0 },
		{ deckName: "Medium Cards", minEase: 2.0, maxEase: 2.5 },
		{ deckName: "Easy Cards", minEase: 2.5, maxEase: 10.0 }
	]);

	// DeckManager instance
	const deckManager = new DeckManager(app, settings);

	/**
	 * Load all decks and their statistics
	 */
	const loadDecks = async () => {
		try {
			setIsLoading(true);
			setError(null);

			const allDecks = await deckManager.getAllDecks();
			setDecks(allDecks);

			// Load statistics for each deck
			const statsMap = new Map<string, DeckStats>();
			for (const deck of allDecks) {
				try {
					const stats = await deckManager.getDeckStats(deck.id);
					statsMap.set(deck.id, stats);
				} catch (statsError) {
					console.error(`Error loading stats for deck ${deck.id}:`, statsError);
					// Continue loading other decks even if one fails
				}
			}
			setDeckStats(statsMap);
		} catch (err) {
			console.error("Error loading decks:", err);
			setError("Failed to load decks. Please try again.");
		} finally {
			setIsLoading(false);
		}
	};

	/**
	 * Load decks on component mount
	 */
	useEffect(() => {
		loadDecks();
	}, []);

	/**
	 * Handle creating a new deck
	 */
	const handleCreateDeck = async () => {
		if (!newDeckName.trim()) {
			setCreateError("Deck name cannot be empty");
			return;
		}

		try {
			setCreateError(null);
			const deck = await deckManager.createDeck(
				newDeckName.trim(),
				newDeckDescription.trim(),
				newDeckFolder.trim() || undefined
			);

			// Update deck with custom settings if different from defaults
			deck.settings = newDeckSettings;
			await deckManager.updateDeck(deck);

			// Reset form
			setNewDeckName("");
			setNewDeckDescription("");
			setNewDeckFolder("");
			setNewDeckSettings({
				newCardsPerDay: DEFAULT_FLASHCARD_SETTINGS.defaultNewCardsPerDay,
				reviewsPerDay: DEFAULT_FLASHCARD_SETTINGS.defaultReviewsPerDay,
				enabledPracticeModes: DEFAULT_FLASHCARD_SETTINGS.defaultEnabledPracticeModes,
				enableAudioCues: DEFAULT_FLASHCARD_SETTINGS.defaultEnableAudioCues
			});
			setShowCreateForm(false);

			// Reload decks
			await loadDecks();

			// Notify parent
			if (onDeckCreated) {
				onDeckCreated(deck);
			}
		} catch (err) {
			console.error("Error creating deck:", err);
			setCreateError(err instanceof Error ? err.message : "Failed to create deck");
		}
	};

	/**
	 * Handle selecting a deck for review
	 * @param deckId - The ID of the deck to select
	 */
	const handleSelectDeck = (deckId: string) => {
		const stats = deckStats.get(deckId);
		if (stats && stats.totalCards === 0) {
			setError("This deck has no cards. Please add flashcards first.");
			return;
		}

		onSelect(deckId);
	};

	/**
	 * Handle starting to edit a deck
	 * @param deck - The deck to edit
	 */
	const handleStartEdit = (deck: Deck) => {
		setEditingDeckId(deck.id);
		setEditDeckName(deck.name);
		setEditDeckDescription(deck.description);
		setEditDeckSettings(deck.settings || {
			newCardsPerDay: DEFAULT_FLASHCARD_SETTINGS.defaultNewCardsPerDay,
			reviewsPerDay: DEFAULT_FLASHCARD_SETTINGS.defaultReviewsPerDay,
			enabledPracticeModes: DEFAULT_FLASHCARD_SETTINGS.defaultEnabledPracticeModes,
			enableAudioCues: DEFAULT_FLASHCARD_SETTINGS.defaultEnableAudioCues
		});
	};

	/**
	 * Handle saving edited deck
	 */
	const handleSaveEdit = async () => {
		if (!editingDeckId) return;

		const deck = decks.find(d => d.id === editingDeckId);
		if (!deck) return;

		if (!editDeckName.trim()) {
			setError("Deck name cannot be empty");
			return;
		}

		try {
			const updatedDeck: Deck = {
				...deck,
				name: editDeckName.trim(),
				description: editDeckDescription.trim(),
				settings: editDeckSettings,
				modified: Date.now()
			};

			await deckManager.updateDeck(updatedDeck);

			// Reset edit state
			setEditingDeckId(null);
			setEditDeckName("");
			setEditDeckDescription("");
			setEditDeckSettings({
				newCardsPerDay: DEFAULT_FLASHCARD_SETTINGS.defaultNewCardsPerDay,
				reviewsPerDay: DEFAULT_FLASHCARD_SETTINGS.defaultReviewsPerDay,
				enabledPracticeModes: DEFAULT_FLASHCARD_SETTINGS.defaultEnabledPracticeModes,
				enableAudioCues: DEFAULT_FLASHCARD_SETTINGS.defaultEnableAudioCues
			});

			// Reload decks
			await loadDecks();

			// Notify parent
			if (onDeckEdited) {
				onDeckEdited(updatedDeck);
			}
		} catch (err) {
			console.error("Error updating deck:", err);
			setError(err instanceof Error ? err.message : "Failed to update deck");
		}
	};

	/**
	 * Handle canceling edit
	 */
	const handleCancelEdit = () => {
		setEditingDeckId(null);
		setEditDeckName("");
		setEditDeckDescription("");
		setEditDeckSettings({
			newCardsPerDay: DEFAULT_FLASHCARD_SETTINGS.defaultNewCardsPerDay,
			reviewsPerDay: DEFAULT_FLASHCARD_SETTINGS.defaultReviewsPerDay,
			enabledPracticeModes: DEFAULT_FLASHCARD_SETTINGS.defaultEnabledPracticeModes,
			enableAudioCues: DEFAULT_FLASHCARD_SETTINGS.defaultEnableAudioCues
		});
	};

	/**
	 * Handle starting delete confirmation
	 * @param deckId - The ID of the deck to delete
	 */
	const handleStartDelete = (deckId: string) => {
		setDeletingDeckId(deckId);
		setDeleteWithCards(false);
	};

	/**
	 * Handle confirming deck deletion
	 */
	const handleConfirmDelete = async () => {
		if (!deletingDeckId) return;

		try {
			await deckManager.deleteDeck(deletingDeckId, deleteWithCards);

			// Reset delete state
			setDeletingDeckId(null);
			setDeleteWithCards(false);

			// Reload decks
			await loadDecks();

			// Notify parent
			if (onDeckDeleted) {
				onDeckDeleted(deletingDeckId);
			}
		} catch (err) {
			console.error("Error deleting deck:", err);
			setError(err instanceof Error ? err.message : "Failed to delete deck");
			setDeletingDeckId(null);
		}
	};

	/**
	 * Handle canceling deck deletion
	 */
	const handleCancelDelete = () => {
		setDeletingDeckId(null);
		setDeleteWithCards(false);
	};

	/**
	 * Handle archiving a deck
	 * @param deckId - ID of the deck to archive
	 */
	const handleArchiveDeck = async (deckId: string) => {
		try {
			await deckManager.archiveDeck(deckId);
			await loadDecks();
		} catch (err) {
			console.error("Error archiving deck:", err);
			setError(err instanceof Error ? err.message : "Failed to archive deck");
		}
	};

	/**
	 * Handle unarchiving a deck
	 * @param deckId - ID of the deck to unarchive
	 */
	const handleUnarchiveDeck = async (deckId: string) => {
		try {
			await deckManager.unarchiveDeck(deckId);
			await loadDecks();
		} catch (err) {
			console.error("Error unarchiving deck:", err);
			setError(err instanceof Error ? err.message : "Failed to unarchive deck");
		}
	};

	/**
	 * Toggle batch selection mode
	 */
	const toggleBatchMode = () => {
		setBatchMode(!batchMode);
		if (batchMode) {
			// Clear selections when exiting batch mode
			setSelectedDeckIds(new Set());
		}
	};

	/**
	 * Toggle deck selection in batch mode
	 * @param deckId - ID of the deck to toggle
	 */
	const toggleDeckSelection = (deckId: string) => {
		const newSelectedIds = new Set(selectedDeckIds);
		if (newSelectedIds.has(deckId)) {
			newSelectedIds.delete(deckId);
		} else {
			newSelectedIds.add(deckId);
		}
		setSelectedDeckIds(newSelectedIds);
	};

	/**
	 * Select all visible decks
	 */
	const selectAllDecks = () => {
		const visibleDecks = getFilteredAndSortedDecks();
		const allIds = new Set(visibleDecks.map(d => d.id));
		setSelectedDeckIds(allIds);
	};

	/**
	 * Deselect all decks
	 */
	const deselectAllDecks = () => {
		setSelectedDeckIds(new Set());
	};

	/**
	 * Handle batch archive operation
	 */
	const handleBatchArchive = async () => {
		try {
			for (const deckId of selectedDeckIds) {
				await deckManager.archiveDeck(deckId);
			}
			setSelectedDeckIds(new Set());
			await loadDecks();
		} catch (err) {
			console.error("Error batch archiving decks:", err);
			setError(err instanceof Error ? err.message : "Failed to archive selected decks");
		}
	};

	/**
	 * Handle batch unarchive operation
	 */
	const handleBatchUnarchive = async () => {
		try {
			for (const deckId of selectedDeckIds) {
				await deckManager.unarchiveDeck(deckId);
			}
			setSelectedDeckIds(new Set());
			await loadDecks();
		} catch (err) {
			console.error("Error batch unarchiving decks:", err);
			setError(err instanceof Error ? err.message : "Failed to unarchive selected decks");
		}
	};

	/**
	 * Handle batch delete operation
	 */
	const handleBatchDelete = async () => {
		if (selectedDeckIds.size === 0) return;

		const confirmMessage = `Are you sure you want to delete ${selectedDeckIds.size} deck${selectedDeckIds.size !== 1 ? 's' : ''}? This action cannot be undone.`;
		if (!confirm(confirmMessage)) {
			return;
		}

		try {
			for (const deckId of selectedDeckIds) {
				await deckManager.deleteDeck(deckId, false);
			}
			setSelectedDeckIds(new Set());
			await loadDecks();
		} catch (err) {
			console.error("Error batch deleting decks:", err);
			setError(err instanceof Error ? err.message : "Failed to delete selected decks");
		}
	};

	/**
	 * Handle batch export operation
	 */
	const handleBatchExport = async () => {
		// TODO(flashcard-export): Implement deck export functionality
		// Formats to consider: JSON (native), Anki (.apkg), CSV
		// Should leverage existing flashcard data structure from deckManager
		setError("Export functionality coming soon");
	};

	/**
	 * Get list of unique source folders from all decks
	 * @returns Array of source folder paths
	 */
	const getSourceFolders = (): string[] => {
		const folders = new Set<string>();
		for (const deck of decks) {
			if (deck.sourceFolder) {
				folders.add(deck.sourceFolder);
			}
		}
		return Array.from(folders).sort();
	};

	/**
	 * Filter and sort decks based on current settings
	 * @returns Filtered and sorted deck array
	 */
	const getFilteredAndSortedDecks = (): Deck[] => {
		let filtered = decks;

		// Filter by archived status
		filtered = filtered.filter(deck => showArchived || !deck.archived);

		// Filter by search query
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase().trim();
			filtered = filtered.filter(deck =>
				deck.name.toLowerCase().includes(query) ||
				deck.description.toLowerCase().includes(query) ||
				deck.sourceFolder?.toLowerCase().includes(query)
			);
		}

		// Filter by source folder
		if (filterBySource !== "all") {
			filtered = filtered.filter(deck => deck.sourceFolder === filterBySource);
		}

		// Sort decks
		const sorted = [...filtered].sort((a, b) => {
			let comparison = 0;

			switch (sortBy) {
				case "name":
					comparison = a.name.localeCompare(b.name);
					break;
				case "date":
					comparison = a.created - b.created;
					break;
				case "cardCount": {
					const statsA = deckStats.get(a.id);
					const statsB = deckStats.get(b.id);
					comparison = (statsA?.totalCards || 0) - (statsB?.totalCards || 0);
					break;
				}
				case "dueCards": {
					const statsA = deckStats.get(a.id);
					const statsB = deckStats.get(b.id);
					comparison = (statsA?.dueToday || 0) - (statsB?.dueToday || 0);
					break;
				}
			}

			return sortOrder === "asc" ? comparison : -comparison;
		});

		return sorted;
	};

	/**
	 * Handle opening the merge modal
	 */
	const handleOpenMerge = () => {
		if (decks.length < 2) {
			setError("You need at least 2 decks to perform a merge");
			return;
		}
		setShowMergeModal(true);
		setMergeTargetDeckId(null);
		setMergeSourceDeckIds(new Set());
		setMergeError(null);
	};

	/**
	 * Handle closing the merge modal
	 */
	const handleCloseMerge = () => {
		setShowMergeModal(false);
		setMergeTargetDeckId(null);
		setMergeSourceDeckIds(new Set());
		setMergeError(null);
	};

	/**
	 * Toggle a deck as a merge source
	 * @param deckId - ID of the deck to toggle
	 */
	const toggleMergeSource = (deckId: string) => {
		const newSourceIds = new Set(mergeSourceDeckIds);
		if (newSourceIds.has(deckId)) {
			newSourceIds.delete(deckId);
		} else {
			newSourceIds.add(deckId);
		}
		setMergeSourceDeckIds(newSourceIds);
		setMergeError(null);
	};

	/**
	 * Handle confirming the merge operation
	 */
	const handleConfirmMerge = async () => {
		// Validate merge parameters
		if (!mergeTargetDeckId) {
			setMergeError("Please select a target deck to merge into");
			return;
		}

		if (mergeSourceDeckIds.size === 0) {
			setMergeError("Please select at least one deck to merge from");
			return;
		}

		if (mergeSourceDeckIds.has(mergeTargetDeckId)) {
			setMergeError("Target deck cannot be included in source decks");
			return;
		}

		try {
			setMergeError(null);

			// Perform the merge
			await deckManager.mergeDeck(
				mergeTargetDeckId,
				Array.from(mergeSourceDeckIds)
			);

			// Close merge modal
			handleCloseMerge();

			// Reload decks
			await loadDecks();
		} catch (err) {
			console.error("Error merging decks:", err);
			setMergeError(err instanceof Error ? err.message : "Failed to merge decks");
		}
	};

	/**
	 * Handle opening the split modal
	 * @param deckId - ID of the deck to split
	 */
	const handleOpenSplit = (deckId: string) => {
		const deck = decks.find(d => d.id === deckId);
		const stats = deckStats.get(deckId);

		if (!deck) {
			setError("Deck not found");
			return;
		}

		if (!stats || stats.totalCards === 0) {
			setError("Cannot split an empty deck");
			return;
		}

		setSplitDeckId(deckId);
		setShowSplitModal(true);
		setSplitCriteria(SplitCriteria.MASTERY);
		setSplitError(null);

		// Reset configurations to defaults
		setMasteryGroups([
			{ deckName: "New Cards", levels: [MasteryLevel.NEW] },
			{ deckName: "Learning Cards", levels: [MasteryLevel.LEARNING] },
			{ deckName: "Mastered Cards", levels: [MasteryLevel.MASTERED] }
		]);
		setDifficultyThresholds([
			{ deckName: "Difficult Cards", minEase: 0, maxEase: 2.0 },
			{ deckName: "Medium Cards", minEase: 2.0, maxEase: 2.5 },
			{ deckName: "Easy Cards", minEase: 2.5, maxEase: 10.0 }
		]);
	};

	/**
	 * Handle closing the split modal
	 */
	const handleCloseSplit = () => {
		setShowSplitModal(false);
		setSplitDeckId(null);
		setSplitError(null);
	};

	/**
	 * Handle confirming the split operation
	 */
	const handleConfirmSplit = async () => {
		if (!splitDeckId) {
			setSplitError("No deck selected for splitting");
			return;
		}

		try {
			setSplitError(null);

			// Build split configuration based on criteria
			const config: SplitConfig = {
				criteria: splitCriteria
			};

			switch (splitCriteria) {
				case SplitCriteria.MASTERY:
					// Validate mastery groups
					if (masteryGroups.length === 0) {
						setSplitError("At least one mastery group must be defined");
						return;
					}
					for (const group of masteryGroups) {
						if (!group.deckName.trim()) {
							setSplitError("All mastery groups must have a name");
							return;
						}
					}
					config.masteryGroups = masteryGroups;
					break;
				case SplitCriteria.DIFFICULTY:
					// Validate difficulty thresholds
					if (difficultyThresholds.length === 0) {
						setSplitError("At least one difficulty threshold must be defined");
						return;
					}
					for (const threshold of difficultyThresholds) {
						if (!threshold.deckName.trim()) {
							setSplitError("All difficulty groups must have a name");
							return;
						}
						if (threshold.minEase > threshold.maxEase) {
							setSplitError("Min ease must be less than or equal to max ease");
							return;
						}
					}
					config.difficultyThresholds = difficultyThresholds;
					break;
				case SplitCriteria.TAGS:
					setSplitError("Tag-based splitting is not yet implemented");
					return;
			}

			// Perform the split
			await deckManager.splitDeck(splitDeckId, config);

			// Close split modal
			handleCloseSplit();

			// Reload decks
			await loadDecks();
		} catch (err) {
			console.error("Error splitting deck:", err);
			setSplitError(err instanceof Error ? err.message : "Failed to split deck");
		}
	};

	/**
	 * Update a mastery group name
	 * @param index - Index of the group
	 * @param newName - New name for the group
	 */
	const updateMasteryGroupName = (index: number, newName: string) => {
		const newGroups = [...masteryGroups];
		newGroups[index].deckName = newName;
		setMasteryGroups(newGroups);
	};

	/**
	 * Update a difficulty threshold name
	 * @param index - Index of the threshold
	 * @param newName - New name for the group
	 */
	const updateDifficultyThresholdName = (index: number, newName: string) => {
		const newThresholds = [...difficultyThresholds];
		newThresholds[index].deckName = newName;
		setDifficultyThresholds(newThresholds);
	};

	/**
	 * Update difficulty threshold values
	 * @param index - Index of the threshold
	 * @param field - Field to update (minEase or maxEase)
	 * @param value - New value
	 */
	const updateDifficultyThresholdValue = (index: number, field: 'minEase' | 'maxEase', value: number) => {
		const newThresholds = [...difficultyThresholds];
		newThresholds[index][field] = value;
		setDifficultyThresholds(newThresholds);
	};

	/**
	 * Add a new difficulty threshold
	 */
	const addDifficultyThreshold = () => {
		setDifficultyThresholds([
			...difficultyThresholds,
			{ deckName: "New Group", minEase: 1.5, maxEase: 3.0 }
		]);
	};

	/**
	 * Remove a difficulty threshold
	 * @param index - Index of the threshold to remove
	 */
	const removeDifficultyThreshold = (index: number) => {
		if (difficultyThresholds.length <= 1) {
			setSplitError("At least one difficulty threshold is required");
			return;
		}
		const newThresholds = difficultyThresholds.filter((_, i) => i !== index);
		setDifficultyThresholds(newThresholds);
	};

	/**
	 * Format a date timestamp to readable string
	 * @param timestamp - Unix timestamp
	 * @returns Formatted date string
	 */
	const formatDate = (timestamp: number): string => {
		const date = new Date(timestamp);
		return date.toLocaleDateString();
	};

	/**
	 * Calculate mastery percentage for a deck
	 * @param stats - Deck statistics
	 * @returns Percentage of mastered cards (0-100)
	 */
	const calculateMasteryPercentage = (stats: DeckStats): number => {
		if (stats.totalCards === 0) return 0;
		return Math.round((stats.masteredCards / stats.totalCards) * 100);
	};

	/**
	 * Toggle a practice mode in the settings
	 * @param mode - Practice mode to toggle
	 * @param isCreate - Whether this is for create form (true) or edit form (false)
	 */
	const togglePracticeMode = (mode: PracticeMode, isCreate: boolean) => {
		const settings = isCreate ? newDeckSettings : editDeckSettings;
		const setSettings = isCreate ? setNewDeckSettings : setEditDeckSettings;

		const currentModes = settings.enabledPracticeModes;
		const newModes = currentModes.includes(mode)
			? currentModes.filter(m => m !== mode)
			: [...currentModes, mode];

		setSettings({
			...settings,
			enabledPracticeModes: newModes
		});
	};

	/**
	 * Get friendly name for practice mode
	 * @param mode - Practice mode enum value
	 * @returns Human-readable name
	 */
	const getPracticeModeName = (mode: PracticeMode): string => {
		switch (mode) {
			case PracticeMode.STANDARD:
				return "Standard";
			case PracticeMode.TYPE_ANSWER:
				return "Type Answer";
			case PracticeMode.MULTIPLE_CHOICE:
				return "Multiple Choice";
			case PracticeMode.CLOZE:
				return "Cloze Deletion";
			default:
				return mode;
		}
	};

	/**
	 * Render deck settings configuration fields
	 * @param settings - Current deck settings
	 * @param setSettings - Setter function for settings
	 * @param isCreate - Whether this is for create form
	 */
	const renderDeckSettings = (settings: DeckSettings, setSettings: (settings: DeckSettings) => void, isCreate: boolean) => {
		const prefix = isCreate ? "new" : "edit";

		return (
			<div className="deck-settings-section-qg">
				<div className="deck-settings-title-qg">Deck Settings</div>

				<div className="deck-settings-row-qg">
					<div className="deck-setting-field-qg">
						<label htmlFor={`${prefix}-new-cards-per-day`}>New Cards Per Day</label>
						<input
							id={`${prefix}-new-cards-per-day`}
							type="number"
							min="1"
							max="100"
							value={settings.newCardsPerDay}
							onChange={(e) => setSettings({
								...settings,
								newCardsPerDay: parseInt(e.target.value) || 20
							})}
							className="deck-setting-number-input-qg"
						/>
					</div>

					<div className="deck-setting-field-qg">
						<label htmlFor={`${prefix}-reviews-per-day`}>Reviews Per Day</label>
						<input
							id={`${prefix}-reviews-per-day`}
							type="number"
							min="1"
							max="500"
							value={settings.reviewsPerDay}
							onChange={(e) => setSettings({
								...settings,
								reviewsPerDay: parseInt(e.target.value) || 100
							})}
							className="deck-setting-number-input-qg"
						/>
					</div>
				</div>

				<div className="deck-setting-field-qg">
					<label>Enabled Practice Modes</label>
					<div className="deck-practice-modes-qg">
						{Object.values(PracticeMode).map((mode) => (
							<label key={mode} className="deck-practice-mode-checkbox-qg">
								<input
									type="checkbox"
									checked={settings.enabledPracticeModes.includes(mode)}
									onChange={() => togglePracticeMode(mode, isCreate)}
								/>
								<span>{getPracticeModeName(mode)}</span>
							</label>
						))}
					</div>
				</div>

				<div className="deck-setting-field-qg">
					<label className="deck-setting-checkbox-qg">
						<input
							type="checkbox"
							checked={settings.enableAudioCues}
							onChange={(e) => setSettings({
								...settings,
								enableAudioCues: e.target.checked
							})}
						/>
						<span>Enable Audio Cues</span>
					</label>
				</div>
			</div>
		);
	};

	/**
	 * Render a single deck item
	 * @param deck - The deck to render
	 */
	const renderDeckItem = (deck: Deck) => {
		const stats = deckStats.get(deck.id);
		const isEditing = editingDeckId === deck.id;
		const isDeleting = deletingDeckId === deck.id;
		const isSelected = selectedDeckIds.has(deck.id);

		// If in delete confirmation mode
		if (isDeleting) {
			return (
				<div key={deck.id} className="deck-item-qg deck-item-deleting-qg">
					<div className="deck-delete-confirm-qg">
						<div className="deck-delete-title-qg">
							Delete "{deck.name}"?
						</div>
						<div className="deck-delete-warning-qg">
							{stats && stats.totalCards > 0 ? (
								<>
									<p>This deck contains {stats.totalCards} card{stats.totalCards !== 1 ? 's' : ''}.</p>
									<label className="deck-delete-option-qg">
										<input
											type="checkbox"
											checked={deleteWithCards}
											onChange={(e) => setDeleteWithCards(e.target.checked)}
										/>
										<span>Also delete all flashcards in this deck</span>
									</label>
								</>
							) : (
								<p>This action cannot be undone.</p>
							)}
						</div>
						<div className="deck-delete-actions-qg">
							<button
								className="deck-action-button-qg deck-delete-confirm-button-qg"
								onClick={handleConfirmDelete}
							>
								Delete
							</button>
							<button
								className="deck-action-button-qg deck-cancel-button-qg"
								onClick={handleCancelDelete}
							>
								Cancel
							</button>
						</div>
					</div>
				</div>
			);
		}

		// If in edit mode
		if (isEditing) {
			return (
				<div key={deck.id} className="deck-item-qg deck-item-editing-qg">
					<div className="deck-edit-form-qg">
						<div className="deck-edit-field-qg">
							<label>Deck Name</label>
							<input
								type="text"
								value={editDeckName}
								onChange={(e) => setEditDeckName(e.target.value)}
								className="deck-name-input-qg"
								placeholder="Enter deck name"
							/>
						</div>
						<div className="deck-edit-field-qg">
							<label>Description (optional)</label>
							<textarea
								value={editDeckDescription}
								onChange={(e) => setEditDeckDescription(e.target.value)}
								className="deck-description-input-qg"
								placeholder="Enter deck description"
								rows={3}
							/>
						</div>

						{renderDeckSettings(editDeckSettings, setEditDeckSettings, false)}

						<div className="deck-edit-actions-qg">
							<button
								className="deck-action-button-qg deck-save-button-qg"
								onClick={handleSaveEdit}
							>
								Save
							</button>
							<button
								className="deck-action-button-qg deck-cancel-button-qg"
								onClick={handleCancelEdit}
							>
								Cancel
							</button>
						</div>
					</div>
				</div>
			);
		}

		// Normal display mode
		return (
			<div
				key={deck.id}
				className={`deck-item-qg ${stats && stats.dueToday > 0 ? 'deck-has-due-qg' : ''} ${isSelected ? 'deck-item-selected-qg' : ''}`}
			>
				<div className="deck-header-qg" onClick={() => batchMode ? toggleDeckSelection(deck.id) : handleSelectDeck(deck.id)}>
					{batchMode && (
						<input
							type="checkbox"
							className="deck-batch-checkbox-qg"
							checked={isSelected}
							onChange={() => toggleDeckSelection(deck.id)}
							onClick={(e) => e.stopPropagation()}
						/>
					)}
					<div className="deck-name-qg">{deck.name}</div>
					{stats && stats.dueToday > 0 && (
						<div className="deck-due-badge-qg">
							{stats.dueToday} due
						</div>
					)}
				</div>

				{deck.description && (
					<div className="deck-description-qg">{deck.description}</div>
				)}

				{stats && (
					<div className="deck-stats-qg">
						<div className="deck-stat-row-qg">
							<div className="deck-stat-item-qg">
								<span className="deck-stat-label-qg">Total Cards:</span>
								<span className="deck-stat-value-qg">{stats.totalCards}</span>
							</div>
							<div className="deck-stat-item-qg">
								<span className="deck-stat-label-qg">New:</span>
								<span className="deck-stat-value-qg deck-stat-new-qg">
									{stats.newCards}
								</span>
							</div>
							<div className="deck-stat-item-qg">
								<span className="deck-stat-label-qg">Learning:</span>
								<span className="deck-stat-value-qg deck-stat-learning-qg">
									{stats.learningCards}
								</span>
							</div>
							<div className="deck-stat-item-qg">
								<span className="deck-stat-label-qg">Mastered:</span>
								<span className="deck-stat-value-qg deck-stat-mastered-qg">
									{stats.masteredCards}
								</span>
							</div>
						</div>

						<div className="deck-mastery-progress-qg">
							<div className="deck-mastery-label-qg">
								Mastery: {calculateMasteryPercentage(stats)}%
							</div>
							<div className="deck-mastery-bar-container-qg">
								<div
									className="deck-mastery-bar-qg"
									style={{ width: `${calculateMasteryPercentage(stats)}%` }}
								/>
							</div>
						</div>

						{stats.studyStreak > 0 && (
							<div className="deck-streak-qg">
								🔥 {stats.studyStreak} day streak
							</div>
						)}

						{/* Quiz readiness indicator (Requirement 10.3, 10.6) */}
						{(() => {
							const suggestionService = new SuggestionService(app, settings);
							const readinessMessage = suggestionService.getQuizReadinessIndicator(stats);
							if (readinessMessage) {
								return (
									<div className="deck-quiz-ready-qg">
										<span className="deck-quiz-ready-icon-qg">✓</span>
										<span>{readinessMessage}</span>
									</div>
								);
							}
							return null;
						})()}
					</div>
				)}

				<div className="deck-metadata-qg">
					<span className="deck-created-qg">Created: {formatDate(deck.created)}</span>
					{stats?.lastReviewed && (
						<span className="deck-last-reviewed-qg">
							Last reviewed: {formatDate(stats.lastReviewed)}
						</span>
					)}
					{deck.sourceFolder && (
						<span className="deck-folder-qg">📁 {deck.sourceFolder}</span>
					)}
				</div>

				<div className="deck-actions-qg">
					<button
						className="deck-action-button-qg deck-review-button-qg"
						onClick={() => handleSelectDeck(deck.id)}
						disabled={!stats || stats.totalCards === 0}
					>
						Review
					</button>
					<button
						className="deck-action-button-qg deck-edit-button-qg"
						onClick={(e) => {
							e.stopPropagation();
							handleStartEdit(deck);
						}}
					>
						Edit
					</button>
					<button
						className="deck-action-button-qg deck-split-button-qg"
						onClick={(e) => {
							e.stopPropagation();
							handleOpenSplit(deck.id);
						}}
						disabled={!stats || stats.totalCards === 0}
						title="Split this deck into multiple decks"
					>
						Split
					</button>
					{deck.archived ? (
						<button
							className="deck-action-button-qg deck-unarchive-button-qg"
							onClick={(e) => {
								e.stopPropagation();
								handleUnarchiveDeck(deck.id);
							}}
							title="Restore this deck to active list"
						>
							Unarchive
						</button>
					) : (
						<button
							className="deck-action-button-qg deck-archive-button-qg"
							onClick={(e) => {
								e.stopPropagation();
								handleArchiveDeck(deck.id);
							}}
							title="Hide this deck from main list"
						>
							Archive
						</button>
					)}
					<button
						className="deck-action-button-qg deck-delete-button-qg"
						onClick={(e) => {
							e.stopPropagation();
							handleStartDelete(deck.id);
						}}
					>
						Delete
					</button>
				</div>
			</div>
		);
	};

	/**
	 * Render the merge decks modal
	 */
	const renderMergeModal = () => {
		if (!showMergeModal) return null;

		return (
			<div className="deck-merge-modal-qg">
				<div className="deck-merge-overlay-qg" onClick={handleCloseMerge} />
				<div className="deck-merge-content-qg">
					<div className="deck-merge-header-qg">
						<h2>Merge Decks</h2>
						<button
							className="deck-merge-close-qg"
							onClick={handleCloseMerge}
							aria-label="Close"
						>
							×
						</button>
					</div>

					{mergeError && (
						<div className="deck-merge-error-qg">{mergeError}</div>
					)}

					<div className="deck-merge-instructions-qg">
						<p>Select a target deck to merge into, then select one or more source decks to merge from.</p>
						<p className="deck-merge-warning-qg">
							⚠️ Warning: Source decks will be deleted after merging. All cards will be moved to the target deck.
						</p>
					</div>

					<div className="deck-merge-section-qg">
						<h3>Target Deck (merge into):</h3>
						<div className="deck-merge-target-list-qg">
							{decks.map(deck => {
								const stats = deckStats.get(deck.id);
								const isSelected = mergeTargetDeckId === deck.id;
								const isDisabled = mergeSourceDeckIds.has(deck.id);

								return (
									<div
										key={deck.id}
										className={`deck-merge-item-qg ${isSelected ? 'deck-merge-selected-qg' : ''} ${isDisabled ? 'deck-merge-disabled-qg' : ''}`}
										onClick={() => {
											if (!isDisabled) {
												setMergeTargetDeckId(deck.id);
												setMergeError(null);
											}
										}}
									>
										<div className="deck-merge-radio-qg">
											<input
												type="radio"
												checked={isSelected}
												onChange={() => {
													if (!isDisabled) {
														setMergeTargetDeckId(deck.id);
														setMergeError(null);
													}
												}}
												disabled={isDisabled}
											/>
										</div>
										<div className="deck-merge-info-qg">
											<div className="deck-merge-name-qg">{deck.name}</div>
											{stats && (
												<div className="deck-merge-stats-qg">
													{stats.totalCards} card{stats.totalCards !== 1 ? 's' : ''}
												</div>
											)}
										</div>
									</div>
								);
							})}
						</div>
					</div>

					<div className="deck-merge-section-qg">
						<h3>Source Decks (merge from):</h3>
						<div className="deck-merge-source-list-qg">
							{decks.map(deck => {
								const stats = deckStats.get(deck.id);
								const isSelected = mergeSourceDeckIds.has(deck.id);
								const isDisabled = mergeTargetDeckId === deck.id;

								return (
									<div
										key={deck.id}
										className={`deck-merge-item-qg ${isSelected ? 'deck-merge-selected-qg' : ''} ${isDisabled ? 'deck-merge-disabled-qg' : ''}`}
										onClick={() => {
											if (!isDisabled) {
												toggleMergeSource(deck.id);
											}
										}}
									>
										<div className="deck-merge-checkbox-qg">
											<input
												type="checkbox"
												checked={isSelected}
												onChange={() => {
													if (!isDisabled) {
														toggleMergeSource(deck.id);
													}
												}}
												disabled={isDisabled}
											/>
										</div>
										<div className="deck-merge-info-qg">
											<div className="deck-merge-name-qg">{deck.name}</div>
											{stats && (
												<div className="deck-merge-stats-qg">
													{stats.totalCards} card{stats.totalCards !== 1 ? 's' : ''}
												</div>
											)}
										</div>
									</div>
								);
							})}
						</div>
					</div>

					{mergeTargetDeckId && mergeSourceDeckIds.size > 0 && (
						<div className="deck-merge-summary-qg">
							<strong>Summary:</strong> {mergeSourceDeckIds.size} deck{mergeSourceDeckIds.size !== 1 ? 's' : ''} will be merged into{' '}
							"{decks.find(d => d.id === mergeTargetDeckId)?.name}".
							Source decks will be deleted.
						</div>
					)}

					<div className="deck-merge-actions-qg">
						<button
							className="deck-action-button-qg deck-merge-confirm-button-qg"
							onClick={handleConfirmMerge}
							disabled={!mergeTargetDeckId || mergeSourceDeckIds.size === 0}
						>
							Merge Decks
						</button>
						<button
							className="deck-action-button-qg deck-cancel-button-qg"
							onClick={handleCloseMerge}
						>
							Cancel
						</button>
					</div>
				</div>
			</div>
		);
	};

	/**
	 * Render the split deck modal
	 */
	const renderSplitModal = () => {
		if (!showSplitModal || !splitDeckId) return null;

		const deck = decks.find(d => d.id === splitDeckId);
		const stats = deckStats.get(splitDeckId);

		if (!deck) return null;

		return (
			<div className="deck-split-modal-qg">
				<div className="deck-split-overlay-qg" onClick={handleCloseSplit} />
				<div className="deck-split-content-qg">
					<div className="deck-split-header-qg">
						<h2>Split Deck: {deck.name}</h2>
						<button
							className="deck-split-close-qg"
							onClick={handleCloseSplit}
							aria-label="Close"
						>
							×
						</button>
					</div>

					{splitError && (
						<div className="deck-split-error-qg">{splitError}</div>
					)}

					<div className="deck-split-instructions-qg">
						<p>Choose how to split this deck. Cards will be distributed into new decks based on your selection.</p>
						{stats && (
							<p className="deck-split-info-qg">
								This deck contains {stats.totalCards} card{stats.totalCards !== 1 ? 's' : ''}: {' '}
								{stats.newCards} new, {stats.learningCards} learning, {stats.masteredCards} mastered
							</p>
						)}
					</div>

					{/* Split criteria selector */}
					<div className="deck-split-section-qg">
						<h3>Split By:</h3>
						<div className="deck-split-criteria-qg">
							<label className="deck-split-radio-option-qg">
								<input
									type="radio"
									name="split-criteria"
									value={SplitCriteria.MASTERY}
									checked={splitCriteria === SplitCriteria.MASTERY}
									onChange={() => setSplitCriteria(SplitCriteria.MASTERY)}
								/>
								<span>
									<strong>Mastery Level</strong>
									<small>Split by new, learning, and mastered cards</small>
								</span>
							</label>

							<label className="deck-split-radio-option-qg">
								<input
									type="radio"
									name="split-criteria"
									value={SplitCriteria.DIFFICULTY}
									checked={splitCriteria === SplitCriteria.DIFFICULTY}
									onChange={() => setSplitCriteria(SplitCriteria.DIFFICULTY)}
								/>
								<span>
									<strong>Difficulty (Ease Factor)</strong>
									<small>Split by card difficulty based on performance</small>
								</span>
							</label>

							<label className="deck-split-radio-option-qg deck-split-disabled-qg">
								<input
									type="radio"
									name="split-criteria"
									value={SplitCriteria.TAGS}
									disabled
								/>
								<span>
									<strong>Tags</strong>
									<small>Split by card tags (coming soon)</small>
								</span>
							</label>
						</div>
					</div>

					{/* Configuration based on selected criteria */}
					{splitCriteria === SplitCriteria.MASTERY && (
						<div className="deck-split-section-qg">
							<h3>Mastery Groups:</h3>
							<div className="deck-split-mastery-config-qg">
								{masteryGroups.map((group, index) => (
									<div key={index} className="deck-split-config-item-qg">
										<input
											type="text"
											value={group.deckName}
											onChange={(e) => updateMasteryGroupName(index, e.target.value)}
											className="deck-split-name-input-qg"
											placeholder="Deck name"
										/>
										<span className="deck-split-config-label-qg">
											({group.levels.join(", ")})
										</span>
									</div>
								))}
							</div>
						</div>
					)}

					{splitCriteria === SplitCriteria.DIFFICULTY && (
						<div className="deck-split-section-qg">
							<h3>Difficulty Groups:</h3>
							<div className="deck-split-difficulty-config-qg">
								{difficultyThresholds.map((threshold, index) => (
									<div key={index} className="deck-split-config-item-qg">
										<input
											type="text"
											value={threshold.deckName}
											onChange={(e) => updateDifficultyThresholdName(index, e.target.value)}
											className="deck-split-name-input-qg"
											placeholder="Deck name"
										/>
										<div className="deck-split-threshold-inputs-qg">
											<label>
												Min Ease:
												<input
													type="number"
													step="0.1"
													min="0"
													value={threshold.minEase}
													onChange={(e) => updateDifficultyThresholdValue(index, 'minEase', parseFloat(e.target.value))}
													className="deck-split-number-input-qg"
												/>
											</label>
											<label>
												Max Ease:
												<input
													type="number"
													step="0.1"
													min="0"
													value={threshold.maxEase}
													onChange={(e) => updateDifficultyThresholdValue(index, 'maxEase', parseFloat(e.target.value))}
													className="deck-split-number-input-qg"
												/>
											</label>
										</div>
										{difficultyThresholds.length > 1 && (
											<button
												className="deck-split-remove-btn-qg"
												onClick={() => removeDifficultyThreshold(index)}
												title="Remove this group"
											>
												×
											</button>
										)}
									</div>
								))}
								<button
									className="deck-split-add-btn-qg"
									onClick={addDifficultyThreshold}
								>
									+ Add Group
								</button>
							</div>
						</div>
					)}

					<div className="deck-split-actions-qg">
						<button
							className="deck-action-button-qg deck-split-confirm-button-qg"
							onClick={handleConfirmSplit}
						>
							Split Deck
						</button>
						<button
							className="deck-action-button-qg deck-cancel-button-qg"
							onClick={handleCloseSplit}
						>
							Cancel
						</button>
					</div>
				</div>
			</div>
		);
	};

	/**
	 * Render the create deck form
	 */
	const renderCreateForm = () => {
		return (
			<div className="deck-create-form-qg">
				<div className="deck-create-title-qg">Create New Deck</div>

				{createError && (
					<div className="deck-create-error-qg">{createError}</div>
				)}

				<div className="deck-create-field-qg">
					<label>Deck Name *</label>
					<input
						type="text"
						value={newDeckName}
						onChange={(e) => setNewDeckName(e.target.value)}
						className="deck-name-input-qg"
						placeholder="Enter deck name"
						autoFocus
					/>
				</div>

				<div className="deck-create-field-qg">
					<label>Description (optional)</label>
					<textarea
						value={newDeckDescription}
						onChange={(e) => setNewDeckDescription(e.target.value)}
						className="deck-description-input-qg"
						placeholder="Enter deck description"
						rows={3}
					/>
				</div>

				<div className="deck-create-field-qg">
					<label>Source Folder (optional)</label>
					<input
						type="text"
						value={newDeckFolder}
						onChange={(e) => setNewDeckFolder(e.target.value)}
						className="deck-folder-input-qg"
						placeholder="e.g., Notes/Biology"
					/>
				</div>

				{renderDeckSettings(newDeckSettings, setNewDeckSettings, true)}

				<div className="deck-create-actions-qg">
					<button
						className="deck-action-button-qg deck-create-button-qg"
						onClick={handleCreateDeck}
					>
						Create
					</button>
					<button
						className="deck-action-button-qg deck-cancel-button-qg"
						onClick={() => {
							setShowCreateForm(false);
							setNewDeckName("");
							setNewDeckDescription("");
							setNewDeckFolder("");
							setNewDeckSettings({
								newCardsPerDay: DEFAULT_FLASHCARD_SETTINGS.defaultNewCardsPerDay,
								reviewsPerDay: DEFAULT_FLASHCARD_SETTINGS.defaultReviewsPerDay,
								enabledPracticeModes: DEFAULT_FLASHCARD_SETTINGS.defaultEnabledPracticeModes,
								enableAudioCues: DEFAULT_FLASHCARD_SETTINGS.defaultEnableAudioCues
							});
							setCreateError(null);
						}}
					>
						Cancel
					</button>
				</div>
			</div>
		);
	};

	/**
	 * Render loading state
	 */
	if (isLoading) {
		return (
			<div className="deck-selector-loading-qg">
				<div className="deck-loading-spinner-qg">Loading decks...</div>
			</div>
		);
	}

	/**
	 * Render main deck selector interface
	 */
	return (
		<div className="deck-selector-qg">
			{renderMergeModal()}
			{renderSplitModal()}

			{error && (
				<div className="deck-selector-error-qg">
					{error}
					<button
						className="deck-error-dismiss-qg"
						onClick={() => setError(null)}
					>
						×
					</button>
				</div>
			)}

			<div className="deck-selector-header-qg">
				<div className="deck-selector-title-qg">Select a Deck</div>
				<div className="deck-header-actions-qg">
					{!showCreateForm && decks.length >= 2 && (
						<button
							className="deck-merge-button-qg"
							onClick={handleOpenMerge}
							title="Merge multiple decks into one"
						>
							Merge Decks
						</button>
					)}
					{!showCreateForm && (
						<button
							className="deck-toggle-archived-button-qg"
							onClick={() => setShowArchived(!showArchived)}
							title={showArchived ? "Hide archived decks" : "Show archived decks"}
						>
							{showArchived ? "Hide Archived" : "Show Archived"}
						</button>
					)}
					{!showCreateForm && decks.length > 0 && (
						<button
							className={`deck-batch-mode-button-qg ${batchMode ? 'active' : ''}`}
							onClick={toggleBatchMode}
							title={batchMode ? "Exit batch selection mode" : "Enter batch selection mode"}
						>
							{batchMode ? "Exit Batch" : "Batch Select"}
						</button>
					)}
					{!showCreateForm && (
						<button
							className="deck-create-new-button-qg"
							onClick={() => setShowCreateForm(true)}
						>
							+ New Deck
						</button>
					)}
				</div>
			</div>

			{/* Search and filter controls (Requirement 7.4, 7.5) */}
			{!showCreateForm && decks.length > 0 && (
				<div className="deck-filters-qg">
					<div className="deck-search-bar-qg">
						<input
							type="text"
							placeholder="Search by name, description, or source..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="deck-search-input-qg"
						/>
						{searchQuery && (
							<button
								className="deck-search-clear-qg"
								onClick={() => setSearchQuery("")}
								title="Clear search"
							>
								×
							</button>
						)}
					</div>

					<div className="deck-filter-controls-qg">
						<div className="deck-filter-group-qg">
							<label htmlFor="source-filter">Source:</label>
							<select
								id="source-filter"
								value={filterBySource}
								onChange={(e) => setFilterBySource(e.target.value)}
								className="deck-filter-select-qg"
							>
								<option value="all">All Sources</option>
								{getSourceFolders().map(folder => (
									<option key={folder} value={folder}>{folder}</option>
								))}
							</select>
						</div>

						<div className="deck-filter-group-qg">
							<label htmlFor="sort-by">Sort by:</label>
							<select
								id="sort-by"
								value={sortBy}
								onChange={(e) => setSortBy(e.target.value as "name" | "date" | "cardCount" | "dueCards")}
								className="deck-filter-select-qg"
							>
								<option value="name">Name</option>
								<option value="date">Creation Date</option>
								<option value="cardCount">Card Count</option>
								<option value="dueCards">Due Cards</option>
							</select>
						</div>

						<button
							className="deck-sort-order-button-qg"
							onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
							title={sortOrder === "asc" ? "Sort descending" : "Sort ascending"}
						>
							{sortOrder === "asc" ? "↑" : "↓"}
						</button>
					</div>
				</div>
			)}

			{/* Batch operations toolbar (Requirement 7.6) */}
			{batchMode && selectedDeckIds.size > 0 && (
				<div className="deck-batch-toolbar-qg">
					<div className="deck-batch-selection-info-qg">
						{selectedDeckIds.size} deck{selectedDeckIds.size !== 1 ? 's' : ''} selected
					</div>
					<div className="deck-batch-actions-qg">
						<button
							className="deck-batch-action-qg"
							onClick={selectAllDecks}
							title="Select all visible decks"
						>
							Select All
						</button>
						<button
							className="deck-batch-action-qg"
							onClick={deselectAllDecks}
							title="Deselect all decks"
						>
							Deselect All
						</button>
						{!showArchived && (
							<button
								className="deck-batch-action-qg deck-batch-archive-qg"
								onClick={handleBatchArchive}
								title="Archive selected decks"
							>
								Archive
							</button>
						)}
						{showArchived && (
							<button
								className="deck-batch-action-qg deck-batch-unarchive-qg"
								onClick={handleBatchUnarchive}
								title="Unarchive selected decks"
							>
								Unarchive
							</button>
						)}
						<button
							className="deck-batch-action-qg deck-batch-export-qg"
							onClick={handleBatchExport}
							title="Export selected decks"
						>
							Export
						</button>
						<button
							className="deck-batch-action-qg deck-batch-delete-qg"
							onClick={handleBatchDelete}
							title="Delete selected decks"
						>
							Delete
						</button>
					</div>
				</div>
			)}

			{showCreateForm && renderCreateForm()}

			{decks.length === 0 && !showCreateForm ? (
				<div className="deck-selector-empty-qg">
					<div className="deck-empty-message-qg">
						No decks found. Create your first deck to get started!
					</div>
					<button
						className="deck-create-first-button-qg"
						onClick={() => setShowCreateForm(true)}
					>
						Create Your First Deck
					</button>
				</div>
			) : (
				<div className="deck-list-qg">
					{getFilteredAndSortedDecks().length === 0 ? (
						<div className="deck-list-empty-qg">
							No decks match your filters.
							{(searchQuery || filterBySource !== "all") && (
								<button
									className="deck-clear-filters-qg"
									onClick={() => {
										setSearchQuery("");
										setFilterBySource("all");
									}}
								>
									Clear Filters
								</button>
							)}
						</div>
					) : (
						getFilteredAndSortedDecks().map(deck => renderDeckItem(deck))
					)}
				</div>
			)}
		</div>
	);
};

export default DeckSelector;
