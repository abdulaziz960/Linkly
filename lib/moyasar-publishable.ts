export function getMoyasarPublishableKey() {
  return (
    process.env.MOYASAR_PUBLISHABLE_KEY ||
    process.env._MOYASAR_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY ||
    ""
  ).trim();
}
