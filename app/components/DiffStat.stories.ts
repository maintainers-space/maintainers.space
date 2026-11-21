import type { Meta, StoryObj } from '@storybook/vue3-vite'
import DiffStat from './DiffStat.vue'

const meta = {
  title: 'Components/DiffStat',
  component: DiffStat,
  args: { additions: 42, deletions: 7, files: 3, showFiles: true }
} satisfies Meta<typeof DiffStat>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const SingleFile: Story = { args: { files: 1 } }

export const WithoutFileCount: Story = { args: { showFiles: false } }

export const AdditionsOnly: Story = { args: { deletions: null } }
