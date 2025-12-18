#!/bin/sh

# Start the Ollama server in the background
ollama serve &
pid=$!

# Give the server a moment to start
sleep 5

echo "Ensuring model llama3.1 is available..."
ollama pull llama3.1
ollama pull nomic-embed-text 
echo "Models are ready."

# Keep the container alive by waiting on the server process
wait "$pid"
