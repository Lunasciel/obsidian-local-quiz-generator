export enum Provider {
	OLLAMA = "OLLAMA",
	OPENAI = "OPENAI",
}

export const providers: Record<Provider, string> = {
	[Provider.OLLAMA]: "Ollama",
	[Provider.OPENAI]: "OpenAI Compatible (LM Studio)",
};
