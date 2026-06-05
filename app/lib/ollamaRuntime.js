const DEFAULT_NUM_THREAD = 10;

export function getOllamaNumThread() {
  const raw = process.env.OLLAMA_NUM_THREAD || process.env.OLLAMA_NUM_THREADS;
  const parsed = Number(raw || DEFAULT_NUM_THREAD);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_NUM_THREAD;
  }

  return Math.floor(parsed);
}

export function getOllamaRequestOptions() {
  return {
    numThread: getOllamaNumThread(),
  };
}
