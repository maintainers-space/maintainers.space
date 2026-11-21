import type { Preview } from '@storybook/vue3-vite'
import { setup } from '@storybook/vue3-vite'
import ui from '@nuxt/ui/vue-plugin'
import '@fontsource-variable/geist/index.css'
import '@fontsource-variable/geist-mono/index.css'
import '../app/assets/css/main.css'

setup((app) => {
  app.use(ui)
})

const preview: Preview = {
  decorators: [() => ({ template: '<UApp><story /></UApp>' })]
}

export default preview
