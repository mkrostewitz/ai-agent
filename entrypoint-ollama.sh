#!/bin/sh

# Start the Ollama server in the background
ollama serve &
pid=$!

# Give the server a moment to start
sleep 5

echo "Ensuring Ollama models are available..."
for model in ${OLLAMA_MODELS_TO_PULL:-phi3:mini nomic-embed-text}; do
  ollama pull "$model"
done
echo "Models are ready."

# Keep the container alive by waiting on the server process
wait "$pid"
