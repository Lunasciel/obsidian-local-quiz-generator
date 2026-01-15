import { App, Notice } from "obsidian";
import { QuizSettings } from "../../settings/config";
import GeneratorFactory from "../../generators/generatorFactory";
import Generator from "../../generators/generator";
import { Flashcard } from "../../utils/types";
import { JSONParser } from "../../utils/jsonParser";
import { generateWithRetry, RetryResult } from "../../utils/retryUtils";
import { createModelResolver } from "../../settings/modelRegistry/modelResolver";
import { Provider } from "../../generators/providers";
import { OpenAIProviderConfig, OllamaProviderConfig } from "../../settings/modelRegistry/types";

/**
 * FlashcardEngine generates flashcards from note content using LLM providers.
 * Integrates with existing generator infrastructure (OpenAI, Ollama).
 *
 * Requirements: 3.2, 3.3, 6.1
 */
export default class FlashcardEngine {
	private readonly app: App;
	private readonly settings: QuizSettings;
	private readonly generator: Generator;

	constructor(app: App, settings: QuizSettings) {
		this.app = app;
		this.settings = settings;
		this.generator = GeneratorFactory.createForActiveModel(settings);
	}

	/**
	 * Generate flashcards from note content using LLM
	 * @param content - Markdown content from note
	 * @param count - Desired number of flashcards to generate
	 * @param deckId - ID of the deck to associate flashcards with
	 * @returns Array of generated flashcards
	 * @throws Error if LLM generation fails
	 */
	public async generateFlashcards(
		content: string,
		count: number,
		deckId: string
	): Promise<Flashcard[]> {
		if (!content || content.trim().length === 0) {
			throw new Error("Cannot generate flashcards from empty content");
		}

		if (count <= 0) {
			throw new Error("Count must be greater than 0");
		}

		try {
			const promptData = this.buildFlashcardPromptData(content, count);

			// Use the shared retry utility for consistent error handling
			const result = await generateWithRetry<{ flashcards: Array<{ front: string; back: string; hint?: string; tags?: string[] }> }>(
				async () => {
					return await this.callGeneratorForFlashcards(
						promptData.system,
						promptData.user
					);
				},
				{
					maxRetries: 3,
					noticePrefix: "Flashcard generation",
					onError: (error, attempt) => {
						console.error(`Flashcard generation attempt ${attempt} failed:`, error.message);
					},
				}
			);

			if (!result.success) {
				throw new Error(result.error?.message || "Failed to generate flashcards");
			}

			// Convert parsed data to Flashcard objects
			const flashcards = this.convertToFlashcards(result.data!, deckId);

			if (flashcards.length === 0) {
				throw new Error("No flashcards were generated from the content");
			}

			return flashcards;
		} catch (error) {
			const errorMessage = (error as Error).message;
			// Only show notice if not already shown by retry utility
			if (!errorMessage.includes("failed after")) {
				new Notice(`Failed to generate flashcards: ${errorMessage}`);
			}
			throw error;
		}
	}

	/**
	 * Generate a single flashcard from a specific text selection
	 * Handles edge cases like empty selections, very short selections, and very long selections
	 * @param selection - Selected text to create flashcard from
	 * @param deckId - ID of the deck to associate flashcard with
	 * @returns Generated flashcard
	 * @throws Error if selection is empty, too short, or generation fails
	 */
	public async generateFromSelection(
		selection: string,
		deckId: string
	): Promise<Flashcard> {
		// Validate selection is not empty
		if (!selection || selection.trim().length === 0) {
			throw new Error("Selection is empty");
		}

		const trimmedSelection = selection.trim();

		// Validate selection has meaningful content (at least 10 characters)
		if (trimmedSelection.length < 10) {
			throw new Error("Selection is too short to generate a meaningful flashcard (minimum 10 characters)");
		}

		// Warn if selection is excessively long (> 5000 chars)
		// Still allow generation, but user should know it might be truncated
		if (trimmedSelection.length > 5000) {
			new Notice("Selection is very long. Flashcard generation may be less effective for large selections.");
		}

		try {
			const flashcards = await this.generateFlashcards(trimmedSelection, 1, deckId);
			return flashcards[0];
		} catch (error) {
			// Re-throw with more context for selection-specific errors
			const errorMessage = (error as Error).message;
			throw new Error(`Failed to generate flashcard from selection: ${errorMessage}`);
		}
	}

	/**
	 * Create a manual flashcard without LLM generation
	 * @param front - Question or prompt
	 * @param back - Answer or explanation
	 * @param deckId - ID of the deck to associate with
	 * @param hint - Optional hint or mnemonic
	 * @returns Created flashcard
	 */
	public createManualFlashcard(
		front: string,
		back: string,
		deckId: string,
		hint?: string
	): Flashcard {
		if (!front || front.trim().length === 0) {
			throw new Error("Front content cannot be empty");
		}

		if (!back || back.trim().length === 0) {
			throw new Error("Back content cannot be empty");
		}

		const now = Date.now();
		const flashcard: Flashcard = {
			id: this.generateFlashcardId(),
			front: front.trim(),
			back: back.trim(),
			deckId,
			created: now,
			modified: now,
			tags: [],
			hint: hint?.trim(),
		};

		return flashcard;
	}

	/**
	 * Build the LLM prompt data for flashcard generation
	 * Emphasizes atomic concepts, clear questions, and preservation of formatting
	 * @param content - Note content to generate flashcards from
	 * @param count - Number of flashcards to generate
	 * @returns Object with system and user prompts
	 */
	private buildFlashcardPromptData(content: string, count: number): { system: string; user: string } {
		return {
			system: this.buildSystemPrompt(),
			user: this.buildUserPrompt(content, count),
		};
	}

	/**
	 * Parse flashcard response from LLM (exposed for testing)
	 * @param response - JSON string from LLM
	 * @param deckId - Deck ID to associate flashcards with
	 * @returns Array of Flashcard objects
	 * @throws Error if JSON is invalid or flashcards array is missing
	 */
	private parseFlashcardResponse(response: string, deckId: string): Flashcard[] {
		let parsed: any;
		try {
			parsed = JSON.parse(response);
		} catch (error) {
			throw new Error("Failed to parse flashcard response: Invalid JSON");
		}

		return this.convertToFlashcards(parsed, deckId);
	}

	/**
	 * Convert parsed flashcard data to Flashcard objects
	 * @param parsed - Parsed JSON data from LLM response
	 * @param deckId - Deck ID to associate flashcards with
	 * @returns Array of Flashcard objects
	 */
	private convertToFlashcards(
		parsed: { flashcards: Array<{ front: string; back: string; hint?: string; tags?: string[] }> },
		deckId: string
	): Flashcard[] {
		if (!parsed.flashcards || !Array.isArray(parsed.flashcards)) {
			throw new Error("Invalid response format: missing or invalid 'flashcards' array");
		}

		const now = Date.now();
		const flashcards: Flashcard[] = [];

		for (const item of parsed.flashcards) {
			if (!item.front || !item.back) {
				console.warn("Skipping invalid flashcard: missing front or back", item);
				continue;
			}

			const flashcard: Flashcard = {
				id: this.generateFlashcardId(),
				front: item.front.trim(),
				back: item.back.trim(),
				deckId,
				created: now,
				modified: now,
				tags: item.tags || [],
				hint: item.hint?.trim(),
			};

			flashcards.push(flashcard);
		}

		return flashcards;
	}

	/**
	 * Build the system prompt that defines flashcard generation rules
	 */
	private buildSystemPrompt(): string {
		const languageNote = this.settings.language !== "English"
			? `\n\nAll flashcards must be generated in ${this.settings.language}. However, the JSON keys must remain in English.`
			: "";

		return `You are an expert at creating high-quality flashcards for spaced repetition learning.

CRITICAL ACCURACY RULES:
- You MUST ONLY use information explicitly stated in the provided notes
- You MUST NOT infer, extrapolate, or add any external knowledge
- You MUST NOT "fill in gaps" or make assumptions about unstated information
- If information is insufficient to create a meaningful flashcard, skip it entirely
- Every fact in your flashcards MUST be directly traceable to the source text
- When in doubt, omit rather than fabricate

Your flashcards should follow these principles:

1. **Atomic Concepts**: Each flashcard should test exactly one concept or fact
2. **Clear Questions**: Front of the card should be unambiguous and precise
3. **Concise Answers**: Back of the card should be focused and to-the-point
4. **Context Independence**: Each card should be understandable on its own
5. **Active Recall**: Questions should require retrieving information from memory
6. **Source Fidelity**: All content must come directly from the provided notes

Your response must be a JSON object with the following structure:
{
  "flashcards": [
    {
      "front": "The question or prompt (markdown supported)",
      "back": "The answer or explanation (markdown supported)",
      "hint": "Optional mnemonic or hint (omit if not applicable)"
    }
  ]
}

**Formatting Guidelines:**
- Preserve markdown tables, code blocks, LaTeX formulas, and lists
- Use $...$ for inline math and $$...$$ for block math
- Keep code blocks with proper syntax highlighting
- Maintain table structure for data comparisons
- Use bold, italics, and other markdown for emphasis${languageNote}

**Example:**
{
  "flashcards": [
    {
      "front": "What is the time complexity of binary search?",
      "back": "O(log n) - because the search space is halved with each comparison",
      "hint": "Think about how the search space changes"
    },
    {
      "front": "What are the three states of matter?",
      "back": "Solid, liquid, and gas"
    }
  ]
}`;
	}

	/**
	 * Build the user prompt with content and count
	 */
	private buildUserPrompt(content: string, count: number): string {
		const countText = count === 1 ? "1 flashcard" : `${count} flashcards`;

		return `Generate ${countText} from the following content.

IMPORTANT: Use ONLY the information provided below. Do not add any external knowledge, do not infer unstated facts, and do not embellish or expand on the content. If the notes don't contain enough information for ${count} good flashcards, create fewer cards rather than fabricating content.

Content:
${content}

Remember:
- Each flashcard should be self-contained and test one atomic concept
- Use clear, unambiguous language
- Preserve any tables, formulas, or code blocks in markdown format
- Include hints for complex or easily confused concepts
- All information must come directly from the provided content - do not add external knowledge`;
	}

	/**
	 * Call the generator with flashcard-specific prompts
	 * Uses the model registry to get provider configuration.
	 *
	 * Requirements: 3.2, 3.3, 6.1
	 */
	private async callGeneratorForFlashcards(
		systemPrompt: string,
		userPrompt: string
	): Promise<string | null> {
		try {
			// Get the active model from the registry
			const resolver = createModelResolver(this.settings);
			const activeModelId = this.settings.activeModelId;

			if (!activeModelId) {
				throw new Error("No active model configured. Please configure a model in settings.");
			}

			const modelConfig = resolver.resolve(activeModelId);
			const providerConfig = modelConfig.providerConfig;

			if (providerConfig.provider === Provider.OPENAI) {
				return await this.callOpenAIForFlashcards(
					systemPrompt,
					userPrompt,
					providerConfig as OpenAIProviderConfig
				);
			} else if (providerConfig.provider === Provider.OLLAMA) {
				return await this.callOllamaForFlashcards(
					systemPrompt,
					userPrompt,
					providerConfig as OllamaProviderConfig
				);
			}

			throw new Error(`Unsupported provider: ${(providerConfig as { provider: string }).provider}`);
		} catch (error) {
			throw new Error(`Generator call failed: ${(error as Error).message}`);
		}
	}

	/**
	 * Call OpenAI API directly for flashcard generation
	 * Uses ProviderConfig from the model registry.
	 *
	 * Requirements: 3.2, 3.3, 6.1
	 */
	private async callOpenAIForFlashcards(
		systemPrompt: string,
		userPrompt: string,
		config: OpenAIProviderConfig
	): Promise<string | null> {
		const OpenAI = (await import("openai")).default;
		const openai = new OpenAI({
			apiKey: config.apiKey,
			baseURL: config.baseUrl,
			dangerouslyAllowBrowser: true,
		});

		const response = await openai.chat.completions.create({
			model: config.textGenerationModel,
			messages: [
				{ role: "system", content: systemPrompt },
				{ role: "user", content: userPrompt },
			],
			response_format: { type: "json_object" },
		});

		if (response.choices[0].finish_reason === "length") {
			new Notice("Generation truncated: Token limit reached. Try with fewer flashcards.");
		}

		return response.choices[0].message.content;
	}

	/**
	 * Call Ollama API directly for flashcard generation
	 * Uses ProviderConfig from the model registry.
	 *
	 * Requirements: 3.2, 3.3, 6.1
	 */
	private async callOllamaForFlashcards(
		systemPrompt: string,
		userPrompt: string,
		config: OllamaProviderConfig
	): Promise<string | null> {
		const { Ollama } = await import("ollama/browser");
		const ollama = new Ollama({
			host: config.baseUrl,
		});

		const response = await ollama.chat({
			model: config.textGenerationModel,
			messages: [
				{ role: "system", content: systemPrompt },
				{ role: "user", content: userPrompt },
			],
			format: "json",
		});

		return response.message.content;
	}

	/**
	 * Generate a unique ID for a flashcard
	 * Format: fc-<timestamp>-<random>
	 */
	private generateFlashcardId(): string {
		const timestamp = Date.now();
		const random = Math.random().toString(36).substring(2, 10);
		return `fc-${timestamp}-${random}`;
	}
}
