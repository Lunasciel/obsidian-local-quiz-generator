import {
	SourceValidationResult,
	FactExtraction,
	ExtractionConsensus,
	SourceDiscrepancy,
	Citation,
	ConsensusFact,
} from "./types";
import { ModelCoordinator } from "./modelCoordinator";
import Generator from "../generators/generator";

/**
 * Prompt response for fact extraction from source material
 */
interface FactExtractionResponse {
	/** Facts extracted from the source */
	facts: string[];

	/** Citations linking facts to source positions */
	citations: Citation[];

	/** Confidence in the extraction (0-1) */
	confidence: number;
}

/**
 * Validates source material through multiple AI models to prevent incorrect
 * interpretations from propagating as truth.
 *
 * The SourceValidator:
 * - Sends source content to multiple models for independent fact extraction
 * - Collects citations (character positions) for each extracted fact
 * - Compares extractions across models to find consensus
 * - Identifies discrepancies where models disagree on interpretation
 * - Calculates overall validation confidence based on agreement
 *
 * This prevents a single model's hallucination or misinterpretation from
 * being accepted as truth in the quiz generation process.
 */
export class SourceValidator {
	/** Model coordinator for parallel invocation */
	private readonly modelCoordinator: ModelCoordinator;

	/** Default timeout for fact extraction requests (60 seconds) */
	private readonly defaultTimeout: number = 60000;

	/**
	 * Create a new source validator
	 *
	 * @param modelCoordinator - Coordinator for invoking multiple models
	 */
	constructor(modelCoordinator: ModelCoordinator) {
		this.modelCoordinator = modelCoordinator;
	}

	/**
	 * Validate source material through multiple models
	 *
	 * This method:
	 * 1. Sends source content to all configured models
	 * 2. Requests each model to extract facts with citations
	 * 3. Compares extractions across models to find consensus
	 * 4. Identifies discrepancies where models disagree
	 * 5. Calculates overall validation confidence
	 *
	 * @param sourceContent - The source material to validate
	 * @param questionContext - Optional context about what questions will be asked
	 * @returns Source validation result with consensus and discrepancies
	 */
	public async validateSource(
		sourceContent: string,
		questionContext?: string
	): Promise<SourceValidationResult> {
		// Generate the fact extraction prompt
		const prompt = this.generateExtractionPrompt(sourceContent, questionContext);

		// Get all model responses for fact extraction
		const modelResponses = await this.invokeModelsForExtraction(prompt);

		// Parse extractions from each model
		const extractions = await this.parseExtractions(modelResponses, sourceContent);

		// Compare extractions to find consensus
		const factConsensus = this.compareExtractions(extractions);

		// Identify discrepancies
		const discrepancies = this.identifyDiscrepancies(extractions);

		// Calculate overall validation confidence
		const validationConfidence = this.calculateValidationConfidence(
			extractions,
			factConsensus
		);

		return {
			sourceContent,
			extractions,
			factConsensus,
			discrepancies,
			validationConfidence,
		};
	}

	/**
	 * Generate a prompt for fact extraction from source material
	 *
	 * The prompt asks models to:
	 * 1. Read the source material carefully
	 * 2. Extract key facts relevant to quiz generation
	 * 3. Provide citations (character positions) for each fact
	 * 4. Indicate confidence in the extraction
	 *
	 * @param sourceContent - The source material
	 * @param questionContext - Optional context about questions to generate
	 * @returns Formatted prompt string
	 */
	private generateExtractionPrompt(
		sourceContent: string,
		questionContext?: string
	): string {
		const contextSection = questionContext
			? `\n\nCONTEXT:\nThis source material will be used to generate quiz questions about: ${questionContext}\nPlease focus on facts relevant to this context.\n`
			: "";

		return `You are a fact extraction expert. Your task is to carefully read the source material below and extract key facts that could be used to generate quiz questions.

SOURCE MATERIAL:
${sourceContent}
${contextSection}

TASK:
1. Read the source material carefully
2. Extract key facts that are clearly stated in the source
3. For each fact, provide a citation with the character position range (start and end)
4. Do NOT infer or extrapolate beyond what is explicitly stated
5. Focus on factual, verifiable statements
6. Indicate your overall confidence in the extraction (0.0 to 1.0)

IMPORTANT:
- Only extract facts that are directly supported by the source material
- Provide accurate character positions for citations
- Do not include opinions, interpretations, or inferences
- Each fact should be a complete, standalone statement

Please respond in the following JSON format:
{
  "facts": [
    "First extracted fact",
    "Second extracted fact",
    ...
  ],
  "citations": [
    {
      "start": <start character position>,
      "end": <end character position>,
      "text": "<exact text from source>",
      "supportsFact": "<which fact this citation supports>"
    },
    ...
  ],
  "confidence": <number between 0.0 and 1.0>
}

EXAMPLE:
If the source says "Paris is the capital of France" at characters 100-130:
{
  "facts": ["Paris is the capital of France"],
  "citations": [
    {
      "start": 100,
      "end": 130,
      "text": "Paris is the capital of France",
      "supportsFact": "Paris is the capital of France"
    }
  ],
  "confidence": 0.95
}`;
	}

	/**
	 * Invoke all models for fact extraction
	 *
	 * @param prompt - The fact extraction prompt
	 * @returns Array of raw responses from models
	 */
	private async invokeModelsForExtraction(
		prompt: string
	): Promise<Array<{ modelId: string; response: string | null; success: boolean }>> {
		const modelCount = this.modelCoordinator.getEnabledModelCount();

		if (modelCount === 0) {
			throw new Error("No models configured for source validation");
		}

		// Invoke all models with the extraction prompt
		// We use the modelCoordinator's invokeModels method which handles parallel execution
		// For source validation, we pass the prompt as content
		const responses = await this.modelCoordinator.invokeModels([prompt], {
			timeout: this.defaultTimeout,
			continueOnError: true,
		});

		return responses.map((response) => ({
			modelId: response.modelId,
			response: response.rawResponse,
			success: response.success,
		}));
	}

	/**
	 * Parse fact extractions from model responses
	 *
	 * @param modelResponses - Raw responses from models
	 * @returns Array of parsed fact extractions
	 */
	private async parseExtractions(
		modelResponses: Array<{ modelId: string; response: string | null; success: boolean }>,
		sourceContent: string
	): Promise<FactExtraction[]> {
		const extractions: FactExtraction[] = [];

		for (const modelResponse of modelResponses) {
			if (!modelResponse.success || !modelResponse.response) {
				// Model failed - add empty extraction with zero confidence
				extractions.push({
					modelId: modelResponse.modelId,
					facts: [],
					citations: [],
					confidence: 0,
				});
				continue;
			}

			try {
				const parsed = this.parseFactExtractionResponse(modelResponse.response);

				// Validate citations against source content
				const validatedCitations = this.validateCitations(
					parsed.citations,
					parsed.facts,
					sourceContent
				);

				extractions.push({
					modelId: modelResponse.modelId,
					facts: parsed.facts,
					citations: validatedCitations,
					confidence: parsed.confidence,
				});
			} catch (error) {
				// Parsing failed - add empty extraction with zero confidence
				extractions.push({
					modelId: modelResponse.modelId,
					facts: [],
					citations: [],
					confidence: 0,
				});
			}
		}

		return extractions;
	}

	/**
	 * Validate citations against source content
	 *
	 * This method ensures that:
	 * 1. Citation positions are within source content bounds
	 * 2. Citation text matches the actual text at those positions
	 * 3. Citations reference facts that actually exist in the fact list
	 *
	 * Invalid citations are filtered out to maintain data integrity.
	 *
	 * @param citations - Citations to validate
	 * @param facts - Facts that were extracted
	 * @param sourceContent - The source material being cited
	 * @returns Array of validated citations (invalid citations removed)
	 */
	private validateCitations(
		citations: Citation[],
		facts: string[],
		sourceContent: string
	): Citation[] {
		const validatedCitations: Citation[] = [];
		const sourceLength = sourceContent.length;

		// Create a set of normalized facts for quick lookup
		const normalizedFacts = new Set(facts.map((fact) => this.normalizeFact(fact)));

		for (const citation of citations) {
			// Validate 1: Check if positions are within bounds
			if (citation.start < 0 || citation.end > sourceLength || citation.start >= citation.end) {
				// Invalid position - skip this citation
				continue;
			}

			// Validate 2: Check if citation text matches source at those positions
			const actualText = sourceContent.substring(citation.start, citation.end);

			// Allow for some whitespace normalization when comparing
			const normalizedActualText = this.normalizeWhitespace(actualText);
			const normalizedCitationText = this.normalizeWhitespace(citation.text);

			// Check if the citation text matches (with some tolerance for whitespace)
			// We use a similarity check rather than exact match to handle minor formatting differences
			const textMatches = this.textsAreEquivalent(
				normalizedActualText,
				normalizedCitationText
			);

			if (!textMatches) {
				// Citation text doesn't match source at those positions - skip
				continue;
			}

			// Validate 3: Check if the citation references a fact that exists
			const normalizedSupportedFact = this.normalizeFact(citation.supportsFact);

			// Check if this fact exists in our fact list (with fuzzy matching)
			let factExists = false;
			for (const normalizedFact of normalizedFacts) {
				if (this.factsAreSimilar(normalizedSupportedFact, normalizedFact)) {
					factExists = true;
					break;
				}
			}

			if (!factExists) {
				// Citation references a fact that wasn't extracted - skip
				continue;
			}

			// All validations passed - add to validated citations
			validatedCitations.push(citation);
		}

		return validatedCitations;
	}

	/**
	 * Normalize whitespace in text for comparison
	 *
	 * @param text - Text to normalize
	 * @returns Text with normalized whitespace
	 */
	private normalizeWhitespace(text: string): string {
		return text.trim().replace(/\s+/g, " ");
	}

	/**
	 * Check if two texts are equivalent (accounting for minor formatting differences)
	 *
	 * Texts are considered equivalent if:
	 * - They match exactly after whitespace normalization, OR
	 * - One is a substring of the other (accounting for models that might extract slightly more/less context), OR
	 * - They have very high character overlap (>90%)
	 *
	 * @param text1 - First text
	 * @param text2 - Second text
	 * @returns True if texts are equivalent
	 */
	private textsAreEquivalent(text1: string, text2: string): boolean {
		// Normalize both texts
		const normalized1 = text1.toLowerCase().trim();
		const normalized2 = text2.toLowerCase().trim();

		// Exact match after normalization
		if (normalized1 === normalized2) {
			return true;
		}

		// Check if one is a substring of the other (within reason - at least 80% overlap)
		const shorterLength = Math.min(normalized1.length, normalized2.length);
		const longerLength = Math.max(normalized1.length, normalized2.length);

		// If length difference is too large (more than 20%), they're not equivalent
		if (shorterLength / longerLength < 0.8) {
			return false;
		}

		// Check if one contains the other
		if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
			return true;
		}

		// Calculate character-level similarity (Levenshtein distance approximation)
		// For performance, we use a simpler metric: count matching characters
		const similarity = this.calculateTextSimilarity(normalized1, normalized2);

		// Require 90% similarity for equivalence
		return similarity >= 0.9;
	}

	/**
	 * Calculate similarity between two texts
	 *
	 * Uses a simple character-by-character comparison.
	 * More sophisticated approaches could use Levenshtein distance.
	 *
	 * @param text1 - First text
	 * @param text2 - Second text
	 * @returns Similarity score (0-1)
	 */
	private calculateTextSimilarity(text1: string, text2: string): number {
		const maxLength = Math.max(text1.length, text2.length);
		if (maxLength === 0) return 1.0;

		let matches = 0;
		const minLength = Math.min(text1.length, text2.length);

		// Count matching characters at the same positions
		for (let i = 0; i < minLength; i++) {
			if (text1[i] === text2[i]) {
				matches++;
			}
		}

		// Similarity is the ratio of matching characters to total length
		return matches / maxLength;
	}

	/**
	 * Parse a fact extraction response from a model
	 *
	 * @param rawResponse - Raw response string from the model
	 * @returns Parsed fact extraction response
	 * @throws Error if response cannot be parsed
	 */
	private parseFactExtractionResponse(rawResponse: string): FactExtractionResponse {
		if (!rawResponse) {
			throw new Error("Empty response");
		}

		let parsed: any;

		// Try direct JSON parsing
		try {
			parsed = JSON.parse(rawResponse);
		} catch {
			// Try to extract JSON from markdown code blocks
			const jsonMatch = rawResponse.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
			if (jsonMatch) {
				parsed = JSON.parse(jsonMatch[1]);
			} else {
				// Try to find any JSON object in the response
				const objectMatch = rawResponse.match(/\{[\s\S]*"facts"[\s\S]*\}/);
				if (objectMatch) {
					parsed = JSON.parse(objectMatch[0]);
				} else {
					throw new Error("Could not find valid JSON in response");
				}
			}
		}

		// Validate required fields
		if (!parsed || typeof parsed !== "object") {
			throw new Error("Response is not a valid object");
		}

		if (!Array.isArray(parsed.facts)) {
			throw new Error("Response missing or invalid 'facts' array");
		}

		if (!Array.isArray(parsed.citations)) {
			throw new Error("Response missing or invalid 'citations' array");
		}

		// Validate confidence (default to 0.5 if missing or invalid)
		const confidence =
			typeof parsed.confidence === "number"
				? Math.max(0, Math.min(1, parsed.confidence))
				: 0.5;

		// Validate citations
		const validatedCitations = parsed.citations
			.filter((citation: any) => {
				return (
					citation &&
					typeof citation === "object" &&
					typeof citation.start === "number" &&
					typeof citation.end === "number" &&
					typeof citation.text === "string" &&
					typeof citation.supportsFact === "string"
				);
			})
			.map((citation: any) => ({
				start: citation.start,
				end: citation.end,
				text: citation.text,
				supportsFact: citation.supportsFact,
			}));

		return {
			facts: parsed.facts.filter((fact: any) => typeof fact === "string"),
			citations: validatedCitations,
			confidence,
		};
	}

	/**
	 * Compare fact extractions across models to find consensus
	 *
	 * This method:
	 * 1. Identifies facts that all models agree on (unanimous consensus)
	 * 2. Identifies facts with partial agreement (some models agree)
	 * 3. Identifies facts with no agreement (single model only)
	 *
	 * Fact similarity is determined using fuzzy matching to account for
	 * slight wording variations that express the same fact.
	 *
	 * @param extractions - Fact extractions from all models
	 * @returns Extraction consensus with agreed, partial, and disagreed facts
	 */
	public compareExtractions(extractions: FactExtraction[]): ExtractionConsensus {
		if (extractions.length === 0) {
			return {
				agreedFacts: [],
				partialAgreementFacts: [],
				disagreedFacts: [],
			};
		}

		// Build a map of facts to the models that extracted them
		const factMap = new Map<string, Set<string>>();

		for (const extraction of extractions) {
			for (const fact of extraction.facts) {
				// Normalize the fact for comparison (lowercase, trim whitespace)
				const normalizedFact = this.normalizeFact(fact);

				// Check if this fact is similar to any existing fact in the map
				let foundSimilar = false;

				for (const [existingFact, models] of factMap.entries()) {
					if (this.factsAreSimilar(normalizedFact, existingFact)) {
						// Add this model to the existing fact's set
						models.add(extraction.modelId);
						foundSimilar = true;
						break;
					}
				}

				if (!foundSimilar) {
					// New fact - create a new entry
					factMap.set(normalizedFact, new Set([extraction.modelId]));
				}
			}
		}

		const totalModels = extractions.length;
		const agreedFacts: string[] = [];
		const partialAgreementFacts: ConsensusFact[] = [];
		const disagreedFacts: string[] = [];

		// Categorize facts based on agreement level
		for (const [fact, agreeingModels] of factMap.entries()) {
			const agreementCount = agreeingModels.size;
			const agreementPercentage = agreementCount / totalModels;

			if (agreementCount === totalModels) {
				// All models agree - unanimous consensus
				agreedFacts.push(fact);
			} else if (agreementCount === 1) {
				// Only one model - no agreement
				disagreedFacts.push(fact);
			} else {
				// Partial agreement
				const disagreeingModels = extractions
					.filter((e) => !agreeingModels.has(e.modelId))
					.map((e) => e.modelId);

				partialAgreementFacts.push({
					fact,
					agreeingModels: Array.from(agreeingModels),
					disagreeingModels,
					agreementPercentage,
				});
			}
		}

		return {
			agreedFacts,
			partialAgreementFacts,
			disagreedFacts,
		};
	}

	/**
	 * Identify discrepancies in source interpretation across models
	 *
	 * A discrepancy occurs when:
	 * 1. Models extract conflicting facts about the same topic
	 * 2. One model interprets a source section very differently from others
	 * 3. Citations for the same fact point to different source sections
	 *
	 * @param extractions - Fact extractions from all models
	 * @returns Array of identified discrepancies
	 */
	public identifyDiscrepancies(extractions: FactExtraction[]): SourceDiscrepancy[] {
		const discrepancies: SourceDiscrepancy[] = [];

		if (extractions.length < 2) {
			// Cannot identify discrepancies with fewer than 2 models
			return discrepancies;
		}

		// Group facts by topic/subject to find conflicting interpretations
		// This is a simplified implementation that looks for facts with similar
		// keywords but different statements

		// Build a map of fact topics to conflicting interpretations
		const topicConflicts = new Map<
			string,
			Array<{ fact: string; modelId: string; citations: Citation[] }>
		>();

		for (const extraction of extractions) {
			for (const fact of extraction.facts) {
				const topic = this.extractFactTopic(fact);

				if (!topicConflicts.has(topic)) {
					topicConflicts.set(topic, []);
				}

				// Get citations for this fact
				const factCitations = extraction.citations.filter(
					(citation) =>
						citation.supportsFact === fact ||
						this.factsAreSimilar(citation.supportsFact, fact)
				);

				topicConflicts.get(topic)!.push({
					fact,
					modelId: extraction.modelId,
					citations: factCitations,
				});
			}
		}

		// Identify topics where models have conflicting interpretations
		for (const [topic, interpretations] of topicConflicts.entries()) {
			// If there's only one interpretation, there's no conflict
			if (interpretations.length <= 1) {
				continue;
			}

			// Check if the facts are actually different (not just slight variations)
			const uniqueFacts = new Set<string>();
			const factGroups: Array<{ fact: string; modelIds: string[]; citations: Citation[] }> = [];

			for (const interp of interpretations) {
				const normalizedFact = this.normalizeFact(interp.fact);

				// Check if this is truly a different fact
				let foundSimilar = false;
				for (const group of factGroups) {
					if (this.factsAreSimilar(normalizedFact, group.fact)) {
						// Same fact - add to existing group
						group.modelIds.push(interp.modelId);
						group.citations.push(...interp.citations);
						foundSimilar = true;
						break;
					}
				}

				if (!foundSimilar) {
					// New unique fact
					uniqueFacts.add(normalizedFact);
					factGroups.push({
						fact: normalizedFact,
						modelIds: [interp.modelId],
						citations: interp.citations,
					});
				}
			}

			// If we have multiple unique facts about the same topic, check if they're contradictory
			if (uniqueFacts.size > 1) {
				// Check if any of the facts are contradictory
				let hasContradiction = false;
				for (let i = 0; i < factGroups.length; i++) {
					for (let j = i + 1; j < factGroups.length; j++) {
						if (this.factsAreContradictory(factGroups[i].fact, factGroups[j].fact)) {
							hasContradiction = true;
							break;
						}
					}
					if (hasContradiction) break;
				}

				if (hasContradiction) {
					// Find the source section where the conflict occurs
					// Use the citations to determine the relevant source section
					let minStart = Infinity;
					let maxEnd = -Infinity;

					for (const interp of interpretations) {
						for (const citation of interp.citations) {
							minStart = Math.min(minStart, citation.start);
							maxEnd = Math.max(maxEnd, citation.end);
						}
					}

					// Get the source section (with some context padding)
					const sourceSection =
						minStart !== Infinity && maxEnd !== -Infinity
							? `Characters ${minStart}-${maxEnd}`
							: "Unknown section";

					discrepancies.push({
						description: `Conflicting interpretations about: ${topic}`,
						sourceSection,
						modelsInvolved: interpretations.map((i) => i.modelId),
						conflictingInterpretations: interpretations.map((i) => i.fact),
					});
				}
			}
		}

		// Also check for citation conflicts - same fact but different source locations
		const factCitationMap = new Map<string, Array<{ modelId: string; citations: Citation[] }>>();

		for (const extraction of extractions) {
			for (const fact of extraction.facts) {
				const normalizedFact = this.normalizeFact(fact);

				if (!factCitationMap.has(normalizedFact)) {
					factCitationMap.set(normalizedFact, []);
				}

				const factCitations = extraction.citations.filter(
					(citation) =>
						citation.supportsFact === fact ||
						this.factsAreSimilar(citation.supportsFact, fact)
				);

				factCitationMap.get(normalizedFact)!.push({
					modelId: extraction.modelId,
					citations: factCitations,
				});
			}
		}

		// Find facts where models cite different source locations
		for (const [fact, citationGroups] of factCitationMap.entries()) {
			if (citationGroups.length < 2) {
				continue;
			}

			// Check if citations point to significantly different locations
			const citationRanges: Array<{ modelId: string; start: number; end: number }> = [];

			for (const group of citationGroups) {
				for (const citation of group.citations) {
					citationRanges.push({
						modelId: group.modelId,
						start: citation.start,
						end: citation.end,
					});
				}
			}

			// Check for non-overlapping citation ranges
			if (this.hasNonOverlappingCitations(citationRanges)) {
				const modelsInvolved = citationGroups.map((g) => g.modelId);

				discrepancies.push({
					description: `Models cite different source locations for the same fact: "${fact}"`,
					sourceSection: citationRanges
						.map((r) => `${r.start}-${r.end}`)
						.join(", "),
					modelsInvolved,
					conflictingInterpretations: citationGroups.map(
						(g) =>
							`Model ${g.modelId} cites: ${g.citations.map((c) => `"${c.text}"`).join(", ")}`
					),
				});
			}
		}

		return discrepancies;
	}

	/**
	 * Normalize a fact for comparison
	 *
	 * @param fact - Fact string to normalize
	 * @returns Normalized fact string
	 */
	private normalizeFact(fact: string): string {
		return fact.toLowerCase().trim().replace(/\s+/g, " ");
	}

	/**
	 * Check if two facts are similar (fuzzy matching)
	 *
	 * Uses a simple similarity metric based on word overlap.
	 * Two facts are considered similar if they share a high percentage of words.
	 * However, facts with different numbers are NOT considered similar.
	 *
	 * @param fact1 - First fact
	 * @param fact2 - Second fact
	 * @returns True if facts are similar
	 */
	private factsAreSimilar(fact1: string, fact2: string): boolean {
		// Extract numbers from both facts
		const numbers1 = fact1.match(/\d+/g) || [];
		const numbers2 = fact2.match(/\d+/g) || [];

		// If facts contain different numbers, they are NOT similar
		// (they might be contradictory)
		if (numbers1.length > 0 || numbers2.length > 0) {
			// Check if numbers are different
			if (numbers1.length !== numbers2.length) {
				return false;
			}
			// Check if any numbers are different
			for (let i = 0; i < numbers1.length; i++) {
				if (numbers1[i] !== numbers2[i]) {
					return false;
				}
			}
		}

		const words1 = new Set(fact1.split(/\s+/));
		const words2 = new Set(fact2.split(/\s+/));

		// Calculate Jaccard similarity (intersection / union)
		const intersection = new Set([...words1].filter((w) => words2.has(w)));
		const union = new Set([...words1, ...words2]);

		const similarity = intersection.size / union.size;

		// Consider facts similar if they share at least 70% of words
		return similarity >= 0.7;
	}

	/**
	 * Check if two facts are contradictory (same topic but conflicting details)
	 *
	 * This method identifies facts that are about the same subject but make
	 * contradictory claims (e.g., different numbers, opposite adjectives).
	 *
	 * @param fact1 - First fact
	 * @param fact2 - Second fact
	 * @returns True if facts are contradictory
	 */
	private factsAreContradictory(fact1: string, fact2: string): boolean {
		// Normalize facts for comparison
		const normalizedFact1 = fact1.toLowerCase().trim();
		const normalizedFact2 = fact2.toLowerCase().trim();

		// Check if facts are too similar (likely the same fact)
		if (this.factsAreSimilar(normalizedFact1, normalizedFact2)) {
			return false;
		}

		// Extract key components
		const words1 = normalizedFact1.split(/\s+/);
		const words2 = normalizedFact2.split(/\s+/);

		// Check if they share the same subject (first 2-3 words for short facts, up to 4 for longer)
		// For short facts (< 6 words), use first 2-3 words
		// For longer facts, use first 3-4 words
		const maxSubjectWords = Math.min(words1.length, words2.length) < 6 ? 3 : 4;
		const subject1 = words1.slice(0, Math.min(maxSubjectWords, words1.length)).join(" ");
		const subject2 = words2.slice(0, Math.min(maxSubjectWords, words2.length)).join(" ");

		const subjectSimilarity = this.calculateWordOverlap(subject1, subject2);

		// If subjects are similar (>= 50% overlap for short facts, >= 60% for longer), check for contradictory details
		const similarityThreshold = Math.min(words1.length, words2.length) < 6 ? 0.5 : 0.6;
		if (subjectSimilarity >= similarityThreshold) {
			// Look for differing numbers
			const numbers1 = normalizedFact1.match(/\d+/g) || [];
			const numbers2 = normalizedFact2.match(/\d+/g) || [];

			if (numbers1.length > 0 && numbers2.length > 0) {
				// Check if any numbers are different
				const hasDifferentNumbers = !numbers1.every(
					(num, idx) => numbers2[idx] === num
				);
				if (hasDifferentNumbers) {
					return true;
				}
			}

			// Look for contradictory adjectives or verbs
			const contradictoryPairs = [
				["is", "isn't"],
				["has", "doesn't have"],
				["was", "wasn't"],
				["are", "aren't"],
				["beautiful", "ugly"],
				["good", "bad"],
				["high", "low"],
				["large", "small"],
				["big", "small"],
				["hot", "cold"],
				["fast", "slow"],
			];

			for (const [word1, word2] of contradictoryPairs) {
				if (
					(normalizedFact1.includes(word1) && normalizedFact2.includes(word2)) ||
					(normalizedFact1.includes(word2) && normalizedFact2.includes(word1))
				) {
					return true;
				}
			}
		}

		return false;
	}

	/**
	 * Calculate word overlap percentage between two strings
	 *
	 * @param str1 - First string
	 * @param str2 - Second string
	 * @returns Overlap percentage (0-1)
	 */
	private calculateWordOverlap(str1: string, str2: string): number {
		const words1 = new Set(str1.toLowerCase().split(/\s+/));
		const words2 = new Set(str2.toLowerCase().split(/\s+/));

		const intersection = new Set([...words1].filter((w) => words2.has(w)));
		const union = new Set([...words1, ...words2]);

		return union.size > 0 ? intersection.size / union.size : 0;
	}

	/**
	 * Extract the main topic/subject from a fact
	 *
	 * This is a simple implementation that extracts the first few significant words.
	 * Numbers and other variable details are excluded to group related facts together.
	 * A more sophisticated implementation could use NLP to identify the subject.
	 *
	 * @param fact - Fact string
	 * @returns Topic string
	 */
	private extractFactTopic(fact: string): string {
		// Remove common stop words and get the first few significant words
		// These words typically form the subject of the sentence
		const stopWords = new Set([
			"the",
			"a",
			"an",
			"is",
			"are",
			"was",
			"were",
			"be",
			"been",
			"being",
			"have",
			"has",
			"had",
			"do",
			"does",
			"did",
			"will",
			"would",
			"could",
			"should",
			"may",
			"might",
			"can",
		]);

		// Also exclude common adjectives/verbs that are typically part of the predicate
		const predicateWords = new Set([
			"beautiful",
			"ugly",
			"good",
			"bad",
			"high",
			"low",
			"large",
			"small",
			"big",
			"hot",
			"cold",
			"fast",
			"slow",
			"charming",
			"nice",
			"poor",
			"rich",
			"old",
			"new",
			"young",
		]);

		// Split into words and filter out numbers, stop words, and predicate words
		const words = fact.toLowerCase().split(/\s+/);
		const significantWords = words
			.filter((word) => !stopWords.has(word))
			.filter((word) => !predicateWords.has(word))
			.filter((word) => !/^\d+$/.test(word)) // Exclude pure numbers
			.slice(0, 2); // Take first 2 significant words to form the subject

		return significantWords.join(" ");
	}

	/**
	 * Check if citation ranges have significant non-overlapping sections
	 *
	 * @param citationRanges - Array of citation ranges with model IDs
	 * @returns True if there are non-overlapping citations
	 */
	private hasNonOverlappingCitations(
		citationRanges: Array<{ modelId: string; start: number; end: number }>
	): boolean {
		if (citationRanges.length < 2) {
			return false;
		}

		// Check each pair of citation ranges
		for (let i = 0; i < citationRanges.length; i++) {
			for (let j = i + 1; j < citationRanges.length; j++) {
				const range1 = citationRanges[i];
				const range2 = citationRanges[j];

				// Check if ranges overlap
				const overlap =
					(range1.start <= range2.end && range1.end >= range2.start) ||
					(range2.start <= range1.end && range2.end >= range1.start);

				if (!overlap) {
					// Found non-overlapping ranges
					return true;
				}
			}
		}

		return false;
	}

	/**
	 * Calculate overall validation confidence based on extractions and consensus
	 *
	 * Confidence is higher when:
	 * - Models have high individual confidence
	 * - More facts have unanimous agreement
	 * - Fewer discrepancies exist
	 *
	 * @param extractions - Fact extractions from all models
	 * @param factConsensus - Consensus on extracted facts
	 * @returns Validation confidence (0-1)
	 */
	private calculateValidationConfidence(
		extractions: FactExtraction[],
		factConsensus: ExtractionConsensus
	): number {
		if (extractions.length === 0) {
			return 0;
		}

		// Calculate average model confidence
		const avgModelConfidence =
			extractions.reduce((sum, e) => sum + e.confidence, 0) / extractions.length;

		// Calculate consensus ratio (how many facts have agreement)
		const totalFacts =
			factConsensus.agreedFacts.length +
			factConsensus.partialAgreementFacts.length +
			factConsensus.disagreedFacts.length;

		const consensusRatio =
			totalFacts > 0
				? (factConsensus.agreedFacts.length +
						factConsensus.partialAgreementFacts.length * 0.5) /
				  totalFacts
				: 0;

		// Weight the components:
		// - 50% from average model confidence
		// - 50% from consensus ratio
		const overallConfidence = avgModelConfidence * 0.5 + consensusRatio * 0.5;

		return Math.max(0, Math.min(1, overallConfidence));
	}
}
