<template>
  <div class="flex gap-4">
    <v-btn
      :disabled="creating"
      @click="emit('quit')"
     variant="text">
      {{ t('shared.cancel') }}
    </v-btn>
    <v-spacer />
    <slot />
    <v-btn
      v-if="next"
      color="primary"
      :loading="creating"
      :disabled="disabled"
      @click="emit('next')"
    >
      {{ t('shared.next') }}
    </v-btn>
    <v-btn
      v-if="create"
      color="primary"
      :loading="creating"
      :disabled="disabled"
      @click="emit('create')"
    >
      {{ t('create') }}
    </v-btn>
  </div>
</template>
<script lang=ts setup>

defineProps<{
  disabled: boolean
  creating: boolean
  create?: boolean
  next?: boolean
}>()

const emit = defineEmits(['quit', 'next', 'create', 'back'])
const { t } = useI18n()
</script>
