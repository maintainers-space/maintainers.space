import type { Meta, StoryObj } from '@storybook/vue3-vite'
import StateBadge from './StateBadge.vue'

const meta = {
  title: 'Components/StateBadge',
  component: StateBadge,
  args: { state: 'open', kind: 'issue', size: 'sm' },
  argTypes: {
    kind: { control: 'inline-radio', options: ['issue', 'pull', 'run'] },
    size: { control: 'inline-radio', options: ['xs', 'sm', 'md'] }
  }
} satisfies Meta<typeof StateBadge>

export default meta
type Story = StoryObj<typeof meta>

export const IssueOpen: Story = {}

export const IssueClosed: Story = { args: { state: 'closed' } }

export const PullMerged: Story = { args: { state: 'merged', kind: 'pull' } }

export const PullDraft: Story = { args: { state: 'draft', kind: 'pull' } }

export const RunFailed: Story = { args: { state: 'failure', kind: 'run' } }

export const UnknownState: Story = { args: { state: 'custom-state' } }
