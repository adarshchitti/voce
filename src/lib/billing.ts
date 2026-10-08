/**
 * Billing kill switch.
 *
 * Stripe is disabled only when NEXT_PUBLIC_BILLING_ENABLED is exactly "false".
 * Anything else — including the variable being unset — leaves billing ON, so a
 * missing env var can never silently hand out free access in production.
 *
 * Deliberately uses the NEXT_PUBLIC_ prefix: the same flag has to read
 * identically on the server (subscription gating, API routes) and in the
 * client components that render billing UI.
 */
export function isBillingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_BILLING_ENABLED !== "false";
}
