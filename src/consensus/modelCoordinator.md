# ModelCoordinator Implementation Summary

## Overview

The `ModelCoordinator` class is a critical component of the multi-model consensus system that manages parallel invocation of multiple AI models for quiz generation. It provides robust error handling, rate limiting, retry logic, and response normalization.

## Key Features

### 1. Parallel Model Invocation
- Invokes multiple AI models concurrently using `Promise.all()` and `Promise.allSettled()`
- Supports both "fail-fast" and "continue-on-error" modes
- Configurable timeout for each model invocation (default: 2 minutes)

### 2. Rate Limiting Integration
- Integrates with `RateLimitManager` to enforce API rate limits per model
- Configurable rate limits based on provider type:
  - OpenAI: 60 requests/minute
  - Ollama: 120 requests/minute (local models)
  - Other providers: 30 requests/minute (conservative default)

### 3. Retry Logic
- Automatic retry with exponential backoff for transient errors
- Configurable maximum retries (default: 2)
- Smart detection of retryable vs non-retryable errors:
  - **Retryable**: Network errors, timeouts, rate limits, 5xx HTTP errors
  - **Non-retryable**: Invalid API keys, malformed requests, validation errors

### 4. Response Normalization
- Parses and validates JSON responses from different model providers
- Handles multiple response formats:
  - Standard format: `{ questions: [...] }`
  - Array format: `[...]` (auto-wrapped)
  - Markdown code blocks: ` ```json {...} ``` `
  - Wrapped content: `{ content: "..." }`
- Returns null for unparseable responses

### 5. Error Handling
- Graceful handling of individual model failures
- Detailed error messages with model ID and failure reason
- Rate limit token release on errors to prevent resource leaks
- Comprehensive error responses for failed invocations

## API

### Constructor
```typescript
constructor(
  modelConfigs: ConsensusModelConfig[],
  rateLimitManager?: RateLimitManager
)
```

### Main Methods

#### `invokeModels(contents, options?)`
Invoke all configured models in parallel to generate quizzes.

**Parameters:**
- `contents: string[]` - Source content for quiz generation
- `options?: InvocationOptions` - Optional configuration
  - `timeout?: number` - Max wait time per model (default: 120000ms)
  - `continueOnError?: boolean` - Continue if some models fail (default: true)
  - `maxRetries?: number` - Max retry attempts per model (default: 2)

**Returns:** `Promise<ModelResponse[]>` - Array of responses from all models

#### `normalizeResponse(rawResponse, provider)`
Parse and normalize a JSON response from a model.

**Parameters:**
- `rawResponse: string | null` - Raw JSON from the model
- `provider: Provider` - Provider type that generated the response

**Returns:** `Quiz | null` - Parsed quiz object or null if parsing failed

### Utility Methods

- `getEnabledModelCount()` - Get the number of enabled models
- `getRateLimitStatus()` - Get rate limit status for all models
- `resetRateLimits()` - Reset all rate limiters

## Response Format

Each model invocation returns a `ModelResponse`:

```typescript
interface ModelResponse {
  modelId: string;           // Unique identifier for the model
  quiz: Quiz | null;         // Parsed quiz (null if failed)
  rawResponse: string;       // Original response from model
  success: boolean;          // Whether parsing succeeded
  error?: string;            // Error message (if failed)
  duration: number;          // Response time in milliseconds
}
```

## Usage Example

```typescript
import { ModelCoordinator } from './consensus/modelCoordinator';
import { ConsensusModelConfig } from './consensus/types';
import { Provider } from './generators/providers';

// Configure models
const modelConfigs: ConsensusModelConfig[] = [
  {
    id: "openai-gpt4",
    provider: Provider.OPENAI,
    settings: { /* QuizSettings */ },
    weight: 1.0,
    enabled: true
  },
  {
    id: "ollama-llama2",
    provider: Provider.OLLAMA,
    settings: { /* QuizSettings */ },
    weight: 1.0,
    enabled: true
  }
];

// Create coordinator
const coordinator = new ModelCoordinator(modelConfigs);

// Invoke models
const responses = await coordinator.invokeModels(
  ["Source content for quiz generation"],
  {
    timeout: 60000,        // 1 minute timeout
    continueOnError: true, // Continue even if one model fails
    maxRetries: 2          // Retry up to 2 times
  }
);

// Process responses
for (const response of responses) {
  if (response.success && response.quiz) {
    console.log(`Model ${response.modelId} generated ${response.quiz.questions.length} questions`);
  } else {
    console.error(`Model ${response.modelId} failed: ${response.error}`);
  }
}
```

## Testing

The implementation includes comprehensive unit tests covering:

- Parallel execution and response collection
- Error handling (individual failures, timeouts, retries)
- Response normalization (multiple formats, edge cases)
- Rate limit integration
- Retry logic (retryable vs non-retryable errors)
- Edge cases (empty configs, disabled models, large content)

All 27 unit tests pass successfully.

## Integration Points

### Dependencies
- `Generator` (abstract base class for model generators)
- `GeneratorFactory` (creates generator instances)
- `RateLimitManager` (enforces API rate limits)
- `Provider` (enum of supported providers)
- `Quiz`, `Question` (type definitions)

### Used By
- `ConsensusOrchestrator` (main coordination logic)
- `ConsensusEngine` (iterative consensus building)

## Security Considerations

1. **API Key Management**: Each model may use different API keys from its settings
2. **Error Messages**: Error messages don't expose sensitive information
3. **Timeout Protection**: All model invocations have timeouts to prevent hanging
4. **Rate Limiting**: Prevents accidental API quota exhaustion

## Performance Characteristics

- **Latency**: ~1.5x single model (due to parallel execution)
- **API Calls**: 1 call per model (+ retries on failure)
- **Memory**: Minimal overhead (stores responses in memory)
- **Concurrency**: Unlimited parallel requests (limited by rate limiter)

## Future Enhancements

1. Request batching for multiple questions
2. Connection pooling for HTTP clients
3. Early termination when consensus is obvious
4. Progressive result streaming
5. Advanced retry strategies (jitter, circuit breaker)
