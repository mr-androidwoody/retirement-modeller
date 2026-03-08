import { runRetirementSimulation } from "./simulator.js";

self.addEventListener("message", (event) => {
  const { type, requestId, inputs } = event.data || {};

  if (type !== "run-simulation") return;

  try {
    const result = runRetirementSimulation(inputs);
    self.postMessage({
      type: "simulation-result",
      requestId,
      result
    });
  } catch (error) {
    self.postMessage({
      type: "simulation-error",
      requestId,
      errors: error instanceof Error ? error.message : "Simulation failed."
    });
  }
});
