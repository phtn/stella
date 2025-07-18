# Stellar

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/yourusername/stellar)
[![Test Coverage](https://img.shields.io/badge/coverage-85%25-green.svg)](https://github.com/yourusername/stellar)
[![Bun](https://img.shields.io/badge/bun-1.2.18-blue.svg)](https://bun.sh)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A command-line chat application that supports multiple AI providers (Cohere and Ollama) with local database storage using bun:sqlite.

## Features

- 💬 Chat with AI assistants from the command line
- 🔄 Support for both Cohere (cloud) and Ollama (local) models
- 💾 Local conversation storage using bun:sqlite
- 🎙️ Voice input and output capabilities
- 📝 Conversation management (create, continue, view, delete)

## Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/stellar.git
cd stellar

# Install dependencies
bun install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your API keys
```

## Usage

### Start a chat session

```bash
bun run stellar chat
```

### Using with Cohere

Stellar supports Cohere's cloud-based models. You'll need to set your API key in the `.env.local` file:

```
COHERE_API_KEY=your_api_key_here
```

### Using with Ollama

Stellar also supports Ollama for local model inference. Make sure Ollama is running:

```bash
# Start Ollama server
ollama serve

# Pull a model if you haven't already
ollama pull llama3.2
```

## Development

### Run tests

```bash
# Run all tests
bun test

# Run specific test file
bun test src/services/db.test.ts
```

### Build the project

```bash
bun build ./src/index.ts --target=bun
```

## Code Examples

### Creating a chat client

```typescript
import { ChatService } from "./services/cohere-v2";
import { OllamaChatService } from "./services/ollama";
import { Message } from "./types";

// Initialize the service
const cohereService = new ChatService();
// OR
const ollamaService = new OllamaChatService();

// Create messages
const messages: Message[] = [
  { role: "user", content: "Hello, AI!" }
];

// Stream responses
for await (const chunk of cohereService.chatStream(messages)) {
  process.stdout.write(chunk);
}
```

### Using the database

```typescript
import { DataService } from "./services/db";
import { Message } from "./types";

// Initialize the database
const db = new DataService();

// Create a new conversation
const conversationId = db.createConversation("My Chat");

// Save messages
db.saveMessage(conversationId, { 
  role: "user", 
  content: "Hello, AI!" 
});

db.saveMessage(conversationId, { 
  role: "assistant", 
  content: "Hello! How can I help you today?" 
});

// Retrieve messages
const messages = db.getConversationMessages(conversationId);
console.log(messages);
```

## Architecture

Stellar uses a modular architecture with the following components:

- **Services**: Handle communication with AI providers and database operations
- **Commands**: Implement CLI commands and user interaction
- **Types**: Define shared type definitions
- **Utils**: Provide helper functions and utilities

## License

MIT