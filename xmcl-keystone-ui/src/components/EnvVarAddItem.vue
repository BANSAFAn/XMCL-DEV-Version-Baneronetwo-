<template>
  <div class="env-var-add flex items-center gap-2 px-2 py-2">
    <v-text-field
      v-model="envVarKey"
      autofocus
      label="Key"
      placeholder="Key"
      variant="outlined"
      density="compact"
      hide-details
      prepend-inner-icon="key"
      class="flex-1"
      @keydown.enter="onSubmit"
    />
    <v-icon size="small" class="text-medium-emphasis">drag_handle</v-icon>
    <v-text-field
      v-model="envVarValue"
      label="Value"
      placeholder="Value"
      variant="outlined"
      density="compact"
      hide-details
      class="flex-1"
      @keydown.enter="onSubmit"
    />
    <v-btn
      v-shared-tooltip="() => t('shared.cancel')"
      icon
      variant="text"
      density="comfortable"
      size="small"
      @click="onEnvVarCleared"
    >
      <v-icon>close</v-icon>
    </v-btn>
    <v-btn
      v-shared-tooltip="() => t('shared.add')"
      icon
      variant="text"
      color="primary"
      density="comfortable"
      size="small"
      :disabled="!envVarKey"
      @click="onSubmit"
    >
      <v-icon>check</v-icon>
    </v-btn>
  </div>
</template>

<script setup lang="ts">
import { vSharedTooltip } from '@/directives/sharedTooltip'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const emit = defineEmits<{
  (event: 'clear'): void
  (event: 'add', key: string, value: string): void
}>()
const envVarKey = ref('')
const envVarValue = ref('')
function onEnvVarCleared() {
  envVarKey.value = ''
  envVarValue.value = ''
  emit('clear')
}
function onSubmit() {
  if (!envVarKey.value) return
  emit('add', envVarKey.value, envVarValue.value)
  envVarKey.value = ''
  envVarValue.value = ''
}
</script>
