export default defineAppConfig({
  ui: {
    colors: {
      primary: 'brand',
      neutral: 'zinc'
    },
    button: {
      compoundVariants: [
        // Yellow primary needs dark text on solid fills for readability
        {
          color: 'primary',
          variant: 'solid',
          class: 'text-white hover:text-white dark:text-neutral-900 dark:hover:text-neutral-900'
        }
      ]
    },
    badge: {
      compoundVariants: [
        { color: 'primary', variant: 'solid', class: 'text-white dark:text-neutral-900' }
      ]
    }
  }
})
