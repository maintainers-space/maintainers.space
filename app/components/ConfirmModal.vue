<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    description?: string
    confirmLabel?: string
    cancelLabel?: string
    color?: 'error' | 'primary' | 'warning'
  }>(),
  { confirmLabel: 'Confirm', cancelLabel: 'Cancel', color: 'error' }
)

const emit = defineEmits<{ close: [boolean] }>()
</script>

<template>
  <UModal :title="title" :description="description">
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          color="neutral"
          variant="soft"
          :label="cancelLabel"
          @click="emit('close', false)"
        />
        <UButton :color="color" :label="confirmLabel" @click="emit('close', true)" />
      </div>
    </template>
  </UModal>
</template>
