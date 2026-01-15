/**
 * Settings Help Text Constants
 *
 * Centralized help text, tooltips, and descriptions for all settings sections.
 * This file provides consistent messaging across the settings UI and makes
 * it easy to update help content in one place.
 *
 * Task 37: Add help text and tooltips throughout settings UI
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
 */

/**
 * Model Configuration Help Text
 * Requirements: 9.1, 9.2, 10.1, 10.5
 */
export const MODEL_CONFIG_HELP = {
	// Display Name
	displayName: {
		tooltip: "A friendly name to identify this model configuration (e.g., 'My GPT-4', 'Local Llama')",
		description: "Choose a memorable name that helps you identify this model when selecting it for quiz generation.",
	},

	// Provider
	provider: {
		tooltip: "The AI service provider for this model",
		description: "Select the AI provider. OpenAI works with the official API and compatible services. Ollama runs models locally on your machine.",
		openai: "OpenAI or compatible API (GPT-4, GPT-3.5, or any OpenAI-compatible endpoint)",
		ollama: "Local AI using Ollama (runs on your machine, no API costs)",
	},

	// API Key
	apiKey: {
		tooltip: "Your API key for authentication with the provider",
		description: "Keep this secret. The key is stored locally in your Obsidian vault settings.",
		placeholder: "sk-...",
	},

	// Base URL
	baseUrl: {
		tooltip: "The API endpoint URL for the provider",
		description: "Use the default for official APIs, or change for self-hosted or alternative providers.",
		openaiDefault: "https://api.openai.com/v1",
		ollamaDefault: "http://localhost:11434",
	},

	// Generation Model
	generationModel: {
		tooltip: "Creates quiz questions from your notes",
		description: "This model analyzes your notes and generates quiz questions. Higher-capability models generally produce better questions but cost more.",
		impact: "Affects question quality, creativity, and accuracy.",
		examples: {
			openai: "gpt-4, gpt-4-turbo, gpt-3.5-turbo",
			ollama: "llama3, mistral, mixtral",
		},
	},

	// Embedding Model
	embeddingModel: {
		tooltip: "Evaluates your answers to short/long answer questions",
		description: "Compares your typed answers with expected answers using semantic similarity. Without this, answer evaluation for free-form questions won't work.",
		impact: "Required for short/long answer question evaluation.",
		warning: "Without an embedding model, short/long answer questions cannot be automatically evaluated.",
		examples: {
			openai: "text-embedding-3-small, text-embedding-3-large",
			ollama: "nomic-embed-text, mxbai-embed-large",
		},
	},
} as const;

/**
 * Mode Comparison Help Text
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 */
export const MODE_HELP = {
	// Main Generation Mode
	main: {
		name: "Main Generation",
		shortDescription: "Single model generates quizzes independently. Fast and cost-effective.",
		fullDescription: "Uses a single AI model to generate quiz questions from your notes. Best for quick quiz generation when you need results fast.",
		analogy: "Like asking one expert to answer a question - quick and straightforward.",
		characteristics: {
			speed: "Fast",
			cost: "Low",
			quality: "Good (depends on model)",
		},
		labels: ["Fast", "Low cost", "Single perspective"],
		whenToUse: "Use when speed and cost are priorities, or for initial testing.",
		tooltip: "Uses one model for fast, cost-effective quiz generation",
	},

	// Consensus Mode
	consensus: {
		name: "Multi-Model Consensus",
		shortDescription: "Multiple models validate answers independently. Quality through agreement.",
		fullDescription: "Multiple AI models independently analyze and generate quiz questions. Questions are only included if models reach consensus (configurable threshold).",
		analogy: "Like multiple doctors independently diagnosing - only accepting diagnoses where all doctors agree.",
		characteristics: {
			speed: "Medium",
			cost: "Higher (scales with model count)",
			quality: "Higher (validated answers)",
		},
		labels: ["Higher quality", "Independent validation", "Requires agreement", "Higher cost"],
		whenToUse: "Use when accuracy is important and you want validation from multiple perspectives.",
		tooltip: "Multiple models must agree for questions to be accepted",
	},

	// Council Mode
	council: {
		name: "LLM Council",
		shortDescription: "Structured debate with a chairperson. Quality through argumentation.",
		fullDescription: "Models engage in structured debate with distinct phases: proposals, critique, ranking, and synthesis. A chair model synthesizes the final output.",
		analogy: "Like an expert panel discussing together, with the chair synthesizing the best solution from the debate.",
		characteristics: {
			speed: "Slower",
			cost: "Highest",
			quality: "Highest (debated and refined)",
		},
		labels: ["Highest quality", "Structured debate", "Chair synthesizes", "Highest cost"],
		whenToUse: "Use when quality is critical and cost/time are not primary concerns.",
		tooltip: "Models debate and a chair synthesizes the best results",
	},

	// General mode comparison
	comparison: {
		tooltip: "Compare the three quiz generation modes to choose the best one for your needs",
		modeSelectionTip: "Enable Consensus or Council mode below to switch from Main generation.",
		mainModelNote: "When Consensus or Council mode is enabled, the Main generation model is NOT used for quiz creation.",
	},
} as const;

/**
 * Consensus Settings Help Text
 * Requirements: 8.3, 8.5, 10.2, 10.3
 */
export const CONSENSUS_HELP = {
	// Enable toggle
	enable: {
		tooltip: "Enable multiple models to validate quiz questions through consensus",
		description: "When enabled, multiple AI models independently analyze questions. Only questions where models agree are included.",
		impact: "Improves accuracy but increases cost and time.",
	},

	// Model selection
	models: {
		tooltip: "Select models to participate in consensus voting",
		description: "Each model independently generates and validates quiz questions. More models means more validation but higher cost.",
		minRequired: "At least 2 models are required for consensus to work.",
		weightExplanation: "Weight determines each model's influence in the consensus vote. Higher weight = more influence.",
	},

	// Consensus threshold
	threshold: {
		tooltip: "Percentage of models that must agree for a question to be accepted",
		description: "Higher thresholds require stronger agreement but may reject more questions.",
		recommendation: "50-66% is recommended for balanced results.",
		warning: "Values above 80% may result in very few questions being accepted.",
	},

	// Max iterations
	iterations: {
		tooltip: "Maximum rounds for models to reconsider their answers",
		description: "If consensus isn't reached, models can re-evaluate based on other responses.",
		impact: "More iterations may improve consensus but increase time and cost.",
	},

	// Minimum models required
	minModels: {
		tooltip: "Minimum models that must successfully respond",
		description: "If fewer models respond, consensus may fail or fall back to single-model mode.",
	},

	// Source validation
	sourceValidation: {
		tooltip: "Validate source documents before generating questions",
		description: "Multiple models verify the source content is appropriate for quiz generation.",
		impact: "Prevents questions from misinterpreted content.",
	},

	// Caching
	caching: {
		tooltip: "Cache results to avoid redundant API calls",
		description: "Saves responses for identical content, reducing costs for repeated generations.",
	},

	// Audit trail
	auditTrail: {
		tooltip: "Show detailed consensus information for each question",
		description: "Displays how models reached agreement, useful for understanding quality.",
	},

	// Fallback
	fallback: {
		tooltip: "Fall back to single-model if consensus fails",
		description: "If consensus cannot be reached, use standard single-model generation instead of failing.",
	},
} as const;

/**
 * Council Settings Help Text
 * Requirements: 8.4, 8.6, 10.2, 10.4
 */
export const COUNCIL_HELP = {
	// Enable toggle
	enable: {
		tooltip: "Enable structured debate between models with a chairperson",
		description: "Models participate in phases: proposals, critique, ranking, and synthesis by the chair.",
		impact: "Produces highest quality but takes longest and costs most.",
	},

	// Model selection
	models: {
		tooltip: "Select models to participate in the council debate",
		description: "Each model contributes proposals and critiques. More diverse models can produce better results.",
		weightExplanation: "Weight affects how much influence each model has in the ranking phase.",
	},

	// Chair model
	chair: {
		tooltip: "The model that synthesizes the final output from the debate",
		description: "The chair reviews all proposals and critiques, then creates the final quiz questions.",
		strategies: {
			configured: "Use a specific model you choose as chair",
			highestRanked: "Use whichever model scored highest in debate",
			rotating: "Rotate through models for each generation",
		},
	},

	// Chair selection strategy
	chairStrategy: {
		tooltip: "How to select which model serves as chairperson",
		configured: "Always use a specific model you select",
		highestRanked: "Use the model that performed best in the debate",
		rotating: "Rotate between models across generations",
	},

	// Critique phase
	critique: {
		tooltip: "Enable models to critique each other's proposals",
		description: "Models review and provide feedback on other proposals, improving quality.",
		impact: "Adds time but improves output quality.",
	},

	// Ranking phase
	ranking: {
		tooltip: "Enable models to rank proposals",
		description: "Models vote on which proposals are best before the chair synthesizes.",
		impact: "Helps the chair identify the strongest contributions.",
	},

	// Debate trail
	debateTrail: {
		tooltip: "Show detailed debate information",
		description: "Displays the full debate process including proposals, critiques, and rankings.",
	},

	// Phase timeouts
	timeouts: {
		tooltip: "Maximum time for each debate phase",
		description: "Prevents phases from taking too long. Adjust based on model response times.",
	},
} as const;

/**
 * Model Management Help Text
 * Requirements: 4.1, 10.1
 */
export const MODEL_MANAGEMENT_HELP = {
	section: {
		tooltip: "Configure all your AI models in one central location",
		description: "Models defined here can be used across Main generation, Consensus mode, and Council mode. Configure each model once and reuse everywhere.",
	},

	addModel: {
		tooltip: "Add a new model configuration to the registry",
		description: "Configure a new AI model with its provider, credentials, and model selections.",
	},

	editModel: {
		tooltip: "Edit this model's configuration",
		description: "Changes will apply everywhere this model is used.",
	},

	deleteModel: {
		tooltip: "Remove this model from the registry",
		warningInUse: "This model is used in other places. Deleting it will remove it from those locations.",
	},

	usageIndicator: {
		tooltip: "Where this model is currently being used",
		description: "Shows which features (Main, Consensus, Council) reference this model.",
	},
} as const;

/**
 * General Settings Help Text
 * Requirements: 6.3, 10.1, 10.3
 */
export const GENERAL_HELP = {
	// Section level
	section: {
		tooltip: "Configure basic plugin behavior and display preferences",
		description: "These settings control how notes are displayed, question ordering, and language preferences.",
	},

	// Show note path
	notePath: {
		tooltip: "Show the full file path for selected notes",
		description: "When enabled, shows the complete vault path instead of just the note name. Useful when you have notes with similar names in different folders.",
	},

	// Show folder path
	folderPath: {
		tooltip: "Show the full folder path in the selection UI",
		description: "When enabled, shows the complete vault path for folders instead of just the folder name.",
	},

	// Include subfolder notes
	includeSubfolders: {
		tooltip: "Include notes from subfolders when a folder is selected",
		description: "When enabled, selecting a folder will include all notes within it and its subfolders for quiz generation.",
	},

	// Randomize question order
	randomizeQuestions: {
		tooltip: "Shuffle the order of questions in each quiz session",
		description: "When enabled, questions are presented in random order. When disabled, questions appear in their generated or saved order.",
	},

	// Language
	language: {
		tooltip: "Language for generated quiz questions",
		description: "Questions will be generated in this language. Choose the language that matches your notes for best results.",
	},

	questionTypes: {
		tooltip: "Types of questions to generate",
		description: "Select which question formats to include in generated quizzes.",
	},

	saveLocation: {
		tooltip: "Where to save generated quizzes",
		description: "Choose a folder in your vault for storing quiz files.",
	},
} as const;

/**
 * Quiz Generation Options Help Text
 * Requirements: 6.3, 10.1
 */
export const GENERATION_OPTIONS_HELP = {
	// Section level
	section: {
		tooltip: "Configure which question types to generate and how many of each",
		description: "Select the types of questions you want in your quizzes and set the quantity for each type.",
	},

	// True/False questions
	trueFalse: {
		tooltip: "Generate true or false questions",
		description: "Simple statements that must be identified as true or false. Quick to answer and good for testing factual knowledge.",
		quantity: "Number of true/false questions to generate per quiz.",
	},

	// Multiple choice questions
	multipleChoice: {
		tooltip: "Generate multiple choice questions",
		description: "Questions with one correct answer among several options. Tests recognition and understanding of concepts.",
		quantity: "Number of multiple choice questions to generate per quiz.",
	},

	// Select all that apply questions
	selectAllThatApply: {
		tooltip: "Generate select all that apply questions",
		description: "Questions where multiple answers may be correct. More challenging than standard multiple choice.",
		quantity: "Number of select all that apply questions to generate per quiz.",
	},

	// Fill in the blank questions
	fillInTheBlank: {
		tooltip: "Generate fill in the blank questions",
		description: "Sentences with missing words or phrases to complete. Tests recall of specific terms and concepts.",
		quantity: "Number of fill in the blank questions to generate per quiz.",
	},

	// Matching questions
	matching: {
		tooltip: "Generate matching questions",
		description: "Pairs of related items to match together. Good for testing associations and relationships between concepts.",
		quantity: "Number of matching questions to generate per quiz.",
	},

	// Short answer questions
	shortAnswer: {
		tooltip: "Generate short answer questions",
		description: "Open-ended questions requiring brief written responses. Evaluated using the embedding model for semantic similarity.",
		quantity: "Number of short answer questions to generate per quiz.",
		note: "Requires an embedding model for automatic answer evaluation.",
	},

	// Long answer questions
	longAnswer: {
		tooltip: "Generate long answer questions",
		description: "Essay-style questions requiring detailed responses. Evaluated using the embedding model for semantic similarity.",
		quantity: "Number of long answer questions to generate per quiz.",
		note: "Requires an embedding model for automatic answer evaluation.",
	},
} as const;

/**
 * Saving Options Help Text
 * Requirements: 6.3, 10.1
 */
export const SAVING_OPTIONS_HELP = {
	// Section level
	section: {
		tooltip: "Configure how and where quizzes are saved",
		description: "Control automatic saving behavior, file format, and save location for generated quizzes.",
	},

	// Auto-save
	autoSave: {
		tooltip: "Automatically save questions when generated",
		description: "When enabled, all generated questions are saved immediately. When disabled, you can choose which questions to save.",
	},

	// Save location
	saveLocation: {
		tooltip: "Folder path where quizzes are saved",
		description: "Enter a vault path to the folder where generated quiz files will be stored. The folder will be created if it doesn't exist.",
	},

	// Save format
	saveFormat: {
		tooltip: "File format for saved quizzes",
		description: "Choose the format for saving quiz files. Different formats are compatible with different spaced repetition plugins.",
		formats: {
			json: "JSON format - Full quiz data for plugin use",
			markdown: "Markdown format - Human-readable and editable",
			spacedRepetition: "Spaced repetition format - Compatible with SR plugins",
		},
	},

	// Quiz material property
	quizMaterialProperty: {
		tooltip: "Frontmatter property linking quiz to source notes",
		description: "Property name used in saved quiz files to link back to the original notes. Leave empty to disable linking.",
		placeholder: "e.g., source-notes, quiz-material",
	},

	// Inline separator
	inlineSeparator: {
		tooltip: "Separator character for inline flashcards",
		description: "The separator used between question and answer for inline spaced repetition flashcards. Common options: ::, -->",
	},

	// Multiline separator
	multilineSeparator: {
		tooltip: "Separator for multiline flashcards",
		description: "The separator used between question and answer for multiline spaced repetition flashcards. Common options: ?\\n, ---",
	},
} as const;

/**
 * Technical Terms Glossary
 * Requirements: 10.5
 */
export const GLOSSARY = {
	generationModel: {
		term: "Generation Model",
		definition: "The AI model that creates quiz questions by analyzing your notes. It determines question quality, creativity, and accuracy.",
	},

	embeddingModel: {
		term: "Embedding Model",
		definition: "The AI model that converts text into numerical vectors for comparison. Used to evaluate how similar your answers are to expected answers.",
	},

	consensus: {
		term: "Consensus",
		definition: "When multiple AI models independently reach the same or similar conclusions. Higher consensus means more confident results.",
	},

	threshold: {
		term: "Threshold",
		definition: "The minimum percentage of models that must agree for a result to be accepted. Higher thresholds require stronger agreement.",
	},

	weight: {
		term: "Weight",
		definition: "A multiplier that affects a model's influence in voting or ranking. Higher weight means more influence.",
	},

	chair: {
		term: "Chair (Council)",
		definition: "The model responsible for synthesizing the final output from a council debate. Reviews all proposals and creates the final result.",
	},

	apiKey: {
		term: "API Key",
		definition: "A secret token used to authenticate with AI services. Keep this private and never share it.",
	},

	baseUrl: {
		term: "Base URL",
		definition: "The server address for the AI API. Change this for self-hosted or alternative providers.",
	},
} as const;

/**
 * Flashcard Settings Help Text
 * Task 17: Reorganize Flashcards section
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6
 */
export const FLASHCARD_HELP = {
	// Section level
	section: {
		tooltip: "Configure flashcard generation, storage, and review settings",
		description: "Customize how flashcards are created, organized, and studied using spaced repetition.",
	},

	// Quick actions
	quickActions: {
		review: {
			tooltip: "Open flashcard review session",
			description: "Start reviewing flashcards from your decks using spaced repetition.",
		},
		manageDecks: {
			tooltip: "Open deck management interface",
			description: "Create, edit, and organize your flashcard decks.",
		},
		statistics: {
			tooltip: "View flashcard statistics and progress",
			description: "See your learning progress, streak data, and performance metrics.",
		},
	},

	// Storage & Organization
	storage: {
		section: {
			tooltip: "Configure where and how flashcards are stored",
			description: "Settings for flashcard file locations, formats, and organization.",
		},
		autoSave: {
			tooltip: "Automatically save flashcards when generated",
			description: "When enabled, flashcards are saved immediately after generation. When disabled, you'll be prompted to save manually.",
			impact: "Affects workflow - auto-save is convenient but manual save gives more control.",
		},
		savePath: {
			tooltip: "Folder where flashcards are saved",
			description: "Choose a vault folder for storing flashcard files. The folder will be created if it doesn't exist.",
			dependsOn: "This path is used when auto-save is enabled or when manually saving flashcards.",
		},
		dedicatedFolder: {
			tooltip: "Dedicated folder for all flashcard files",
			description: "All flashcard files will be organized within this folder, keeping your vault tidy.",
		},
		organizationScheme: {
			tooltip: "How flashcards are organized within the folder",
			description: "Choose between flat (all in one folder), mirror (match source note structure), or deck-based (organize by deck name).",
			options: {
				flat: "All flashcards in a single folder - simple and easy to find",
				mirror: "Mirror your vault's folder structure - maintains context",
				deckBased: "Organize by deck name - good for topic-based learning",
			},
		},
		autoMigrate: {
			tooltip: "Automatically move files when folder settings change",
			description: "When you change the folder or organization scheme, existing flashcards will be moved to match the new structure.",
			warning: "This will move files in your vault. Make sure you have backups.",
		},
		saveFormat: {
			tooltip: "Format for saved flashcard files",
			description: "Choose how flashcards are formatted. Callout format uses Obsidian callout blocks, Spaced Repetition format is compatible with SR plugins.",
		},
		materialProperty: {
			tooltip: "Frontmatter property linking to source notes",
			description: "Property name used to link flashcard files back to their source notes. Helps track where flashcards came from.",
		},
		inlineSeparator: {
			tooltip: "Separator for inline flashcard format",
			description: "The separator between question and answer in inline format (e.g., 'Question :: Answer').",
		},
	},

	// Spaced Repetition
	spacedRepetition: {
		section: {
			tooltip: "Configure the spaced repetition algorithm (SM-2)",
			description: "Fine-tune how flashcard intervals are calculated based on your review performance.",
		},
		easeFactor: {
			default: {
				tooltip: "Starting ease factor for new cards (SM-2)",
				description: "Higher values mean longer initial intervals. Standard is 2.5.",
				impact: "Affects how quickly card intervals grow.",
			},
			min: {
				tooltip: "Minimum ease factor for any card",
				description: "Prevents cards from becoming too difficult with very short intervals.",
			},
			max: {
				tooltip: "Maximum ease factor for any card",
				description: "Caps ease to prevent excessively long intervals.",
			},
		},
		intervals: {
			again: {
				tooltip: "Days until next review when you forget a card",
				description: "When you select 'Again', the card resets and you'll see it after this many days.",
			},
			hard: {
				tooltip: "Multiplier for 'Hard' rating",
				description: "Applied to current interval when a card is difficult but not forgotten.",
			},
			good: {
				tooltip: "Multiplier for 'Good' rating",
				description: "Standard progression multiplier. Uses the card's ease factor.",
			},
			easy: {
				tooltip: "Multiplier for 'Easy' rating",
				description: "Applied when you know a card well. Creates longer intervals.",
			},
		},
		constraints: {
			minInterval: {
				tooltip: "Shortest time between any reviews",
				description: "No card will be shown sooner than this many days after a review.",
			},
			maxInterval: {
				tooltip: "Longest time between reviews",
				description: "Even well-known cards won't exceed this interval. Prevents forgetting.",
			},
			historyLength: {
				tooltip: "Reviews to keep in card history",
				description: "Used for statistics and tracking performance over time.",
			},
		},
	},

	// Review Sessions
	reviewSessions: {
		section: {
			tooltip: "Configure default review session behavior",
			description: "Settings for new cards per day, reviews per day, and session features.",
		},
		newCardsPerDay: {
			tooltip: "New cards to introduce daily for new decks",
			description: "Default limit for new flashcards shown each day. Can be adjusted per deck.",
			impact: "Higher values = faster learning but more daily workload.",
		},
		reviewsPerDay: {
			tooltip: "Review cards limit per day for new decks",
			description: "Maximum review flashcards shown daily. Controls session workload.",
		},
		practiceModes: {
			tooltip: "Default practice modes for new decks",
			description: "Select which study modes are enabled by default: standard reveal, type answer, multiple choice, or cloze deletion.",
		},
		audioCues: {
			tooltip: "Text-to-speech audio for flashcards",
			description: "Enable audio cues for multi-sensory learning and pronunciation practice.",
		},
		highContrast: {
			tooltip: "Enhanced contrast for visibility",
			description: "Improves visibility with higher contrast. Recommended for users with visual impairments.",
		},
		keyboardShortcuts: {
			tooltip: "Customize review keyboard shortcuts",
			description: "Set custom keys for reveal, navigation, and rating actions.",
		},
	},

	// Goals & Motivation
	goals: {
		section: {
			tooltip: "Set learning goals and track motivation",
			description: "Configure daily goals, streaks, and progress tracking.",
		},
		dailyCardGoal: {
			tooltip: "Target cards to review each day",
			description: "Your daily review goal. Progress is tracked in statistics.",
		},
		dailyTimeGoal: {
			tooltip: "Target study time in minutes",
			description: "Daily time goal for building a consistent study habit.",
		},
		streakNotifications: {
			tooltip: "Celebrate streak milestones",
			description: "Show notifications at 7, 30, and 100 day streaks. Helps maintain motivation.",
		},
		statusBar: {
			tooltip: "Show flashcard count in status bar",
			description: "Displays deck count for the active note. Click to open review.",
			dependsOn: "Requires flashcards to be associated with notes.",
		},
	},
} as const;

/**
 * Get a tooltip string with optional additional context
 */
export function getTooltip(
	helpObject: { tooltip: string; impact?: string },
	includeImpact = true
): string {
	if (includeImpact && helpObject.impact) {
		return `${helpObject.tooltip}. ${helpObject.impact}`;
	}
	return helpObject.tooltip;
}

/**
 * Format glossary term with definition for display
 */
export function formatGlossaryTerm(key: keyof typeof GLOSSARY): string {
	const entry = GLOSSARY[key];
	return `${entry.term}: ${entry.definition}`;
}

/**
 * Get mode characteristics as a formatted string
 */
export function getModeCharacteristics(
	mode: keyof typeof MODE_HELP
): string {
	const modeInfo = MODE_HELP[mode];
	if (!("characteristics" in modeInfo)) return "";

	const chars = modeInfo.characteristics;
	return `Speed: ${chars.speed} | Cost: ${chars.cost} | Quality: ${chars.quality}`;
}
