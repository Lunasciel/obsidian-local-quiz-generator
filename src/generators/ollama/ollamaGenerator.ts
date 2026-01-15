import { Ollama } from "ollama/dist/browser.mjs";
import Generator from "../generator";
import { cosineSimilarity } from "../../utils/helpers";
import { GeneratorSettings, OllamaProviderConfig } from "../generatorTypes";
import { Provider } from "../providers";

/**
 * Ollama generator for quiz generation and answer evaluation.
 *
 * Uses local Ollama instances for LLM inference.
 * Uses the ProviderConfig for API configuration and GeneratorSettings for
 * quiz generation parameters.
 *
 * Requirements: 3.2, 3.3
 */
export default class OllamaGenerator extends Generator {
	private readonly ollama: Ollama;
	private readonly providerConfig: OllamaProviderConfig;

	constructor(settings: GeneratorSettings) {
		super(settings);

		// Validate that we have Ollama provider config
		if (settings.providerConfig.provider !== Provider.OLLAMA) {
			throw new Error(
				`OllamaGenerator requires Ollama provider config, got: ${settings.providerConfig.provider}`
			);
		}

		this.providerConfig = settings.providerConfig as OllamaProviderConfig;
		this.ollama = new Ollama({ host: this.providerConfig.baseUrl });
	}

	public async generateQuiz(contents: string[]): Promise<string> {
		try {
			const response = await this.ollama.generate({
				model: this.providerConfig.textGenerationModel,
				system: this.systemPrompt(),
				prompt: this.userPrompt(contents),
				format: "json",
				stream: false,
			});

			return response.response;
		} catch (error) {
			throw new Error((error as Error).message);
		}
	}

	public async shortOrLongAnswerSimilarity(userAnswer: string, answer: string): Promise<number> {
		try {
			const embedding = await this.ollama.embed({
				model: this.providerConfig.embeddingModel,
				input: [userAnswer, answer],
			});

			return cosineSimilarity(embedding.embeddings[0], embedding.embeddings[1]);
		} catch (error) {
			throw new Error((error as Error).message);
		}
	}
}
