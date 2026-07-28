// Restore the saved accent color as early as possible, before the first paint
// most of the UI is rendered with, so there's no flash of the default yellow.
export default defineNuxtPlugin(() => {
  useAccentColor().load()
})
