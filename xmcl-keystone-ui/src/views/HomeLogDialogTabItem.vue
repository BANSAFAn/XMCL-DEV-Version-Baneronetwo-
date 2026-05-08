<template>
  <v-list-item v-ripple :disabled="disabled" :title="source.name" @click="openFile(source.name)">
    <template #prepend>
      <v-avatar>
        <v-icon>clear_all</v-icon>
      </v-avatar></template
    >
    <template #append>
      <v-list-item-action>
        <v-btn icon @click.prevent.stop="showFile(source.name)" variant="text">
          <v-icon>folder</v-icon>
        </v-btn>
        <v-btn icon color="error" @click.prevent.stop="removeFile(source.name)" variant="text">
          <v-icon>delete</v-icon>
        </v-btn>
      </v-list-item-action>
    </template>
  </v-list-item>
</template>

<script lang="ts" setup>
defineProps<{
  source: { name: string; id: string }
  disabled: boolean
  removeFile(file: string): Promise<void>
  showFile(file: string): void
  openFile(file: string): void
}>()
</script>
