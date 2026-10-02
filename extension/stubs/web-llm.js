// Firefox build: WebGPU is not reliable there, so the local LLM is not shipped.
export async function CreateMLCEngine() {
  throw new Error('Local LLM is not available in Firefox. Use the Groq provider.');
}
