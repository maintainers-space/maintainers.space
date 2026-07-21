export default defineAppConfig({
  ui: {
    colors: {
      primary: 'brand',
      neutral: 'zinc'
    },
    button: {
      compoundVariants: [
        // Yellow primary needs dark text on solid fills for readability
        { color: 'primary', variant: 'solid', class: 'text-neutral-900 hover:text-neutral-900' }
      ]
    },
    badge: {
      compoundVariants: [
        { color: 'primary', variant: 'solid', class: 'text-neutral-900' }
      ]
    }
  }
})
