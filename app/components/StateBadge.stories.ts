import type { Meta, StoryObj } from '@storybook/vue3'
import StateBadge from './StateBadge.vue'

const meta: Meta<typeof StateBadge> = {
  title: 'Components/StateBadge',
  component: StateBadge,
  tags: ['autodocs'],
  argTypes: {
    state: {
      control: 'select',
      options: [
        'open',
        'closed',
        'merged',
        'draft',
        'success',
        'failure',
        'running',
        'pending',
        'queued',
        'cancelled',
        'skipped',
        'timed_out',
        'unknown'
      ]
    },
    kind: {
      control: 'select',
      options: ['issue', 'pull', 'run']
    },
    size: {
      control: 'select',
      options: ['xs', 'sm', 'md']
    }
  }
}

export default meta
type Story = StoryObj<typeof StateBadge>

export const OpenIssue: Story = {
  args: {
    state: 'open',
    kind: 'issue'
  }
}

export const MergedPull: Story = {
  args: {
    state: 'merged',
    kind: 'pull'
  }
}

export const FailedRun: Story = {
  args: {
    state: 'failure',
    kind: 'run'
  }
}
