// Marker for the targeted-angle prompt block. Tests assert this string appears
// (or doesn't) depending on whether selection produced a fit.
export const PERSONAL_ANGLE_BLOCK_HEADING = "PERSONAL ANGLE TO WEAVE IN";

export function buildPersonalAngleInstruction(component: string): string {
  return `${PERSONAL_ANGLE_BLOCK_HEADING}:

The user has the following personal experience that fits this draft topic:
"${component}"

Weave this experience into the regenerated draft naturally. Use it to add specificity and first-person grounding. Do NOT extend or extrapolate beyond what's stated; if the component says "I shipped 3 RAG systems," do not say "I shipped many RAG systems and learned X, Y, Z" unless those details are in the component or other parts of the user's voice profile.

The experience should feel naturally integrated, not bolted on. If you cannot find a graceful way to include it, you may produce a draft without explicit reference to it.`;
}
