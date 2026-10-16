// The email inbox also accepts non-Gmail mail, but its conversations do not
// record a trustworthy per-message provider. Exclude the whole channel so
// historical Gmail content cannot reach an AI provider after a reconnect.
export function isGoogleAiExcludedChannel(channel: string): boolean {
  return channel === "email" || channel === "gmail" || channel === "youtube" || channel === "google_maps";
}
