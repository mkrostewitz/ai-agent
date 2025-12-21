#!/bin/sh

# Start the Ollama server in the background
ollama serve &
pid=$!

# Give the server a moment to start
sleep 5

echo "Ensuring modelis available..."
ollama pull phi3:mini
ollama pull nomic-embed-text
echo "Models are ready."

# Keep the container alive by waiting on the server process
wait "$pid"
