import { runRetirementSimulation } from "./simulator.js";

self.onmessage = (event) => {
  const { type, inputs } = event.data || {};
  if (type !== "run") return;

  try {
    const result = runRetirementSimulation(inputs);
    self.postMessage({ ok: true, result });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error && error.message ? error.message : "Unknown worker error."
    });
  }
};
