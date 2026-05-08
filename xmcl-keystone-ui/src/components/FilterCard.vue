<template>
  <v-card class="rounded-xl w-full flex-shrink-0" variant="flat" border>
    <div class="flex items-center gap-2 px-4 pt-3 pb-2">
      <span class="font-bold text-xs uppercase tracking-wider opacity-80">
        {{ title }}
      </span>
      <v-chip
        v-if="selectedCount"
        size="x-small"
        color="primary"
        variant="flat"
        density="comfortable"
      >
        {{ selectedCount }}
      </v-chip>
      <v-spacer />
      <v-btn
        v-if="selectedCount > 0"
        v-shared-tooltip="() => 'Clear'"
        icon="close"
        variant="text"
        color="error"
        size="x-small"
        density="comfortable"
        @click="emit('clear')"
      />
      <v-btn
        v-if="items.length > collapsedCount"
        v-shared-tooltip="() => expanded ? 'Collapse' : 'Show all'"
        :icon="expanded ? 'expand_less' : 'expand_more'"
        variant="text"
        size="x-small"
        density="comfortable"
        @click="expanded = !expanded"
      />
    </div>
    <div class="px-3 pb-3">
      <div class="grid grid-cols-2 gap-1">
        <div
          v-for="item in visibleItems"
          :key="item.id"
          v-shared-tooltip="() => item.text"
          class="filter-item flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors"
          :class="isSelected(item.id) ? 'filter-item--selected' : ''"
          @click="emit('toggle', item.id)"
        >
          <div
            v-if="item.iconHTML"
            class="w-5 h-5 flex-shrink-0 flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
            v-html="item.iconHTML"
          />
          <img
            v-else-if="item.icon"
            :src="item.icon"
            class="w-5 h-5 flex-shrink-0 object-contain"
          >
          <span class="text-xs font-medium truncate">{{ item.text }}</span>
        </div>
      </div>
      <div
        v-if="!expanded && items.length > collapsedCount"
        class="text-center mt-1 text-xs opacity-60 cursor-pointer hover:opacity-100"
        @click="expanded = true"
      >
        +{{ items.length - collapsedCount }} more
      </div>
    </div>
  </v-card>
</template>

<script lang="ts" setup>
import { vSharedTooltip } from '@/directives/sharedTooltip'

export interface FilterItem {
  id: string
  text: string
  iconHTML?: string
  icon?: string
}

const props = defineProps<{
  title: string
  items: FilterItem[]
  selected: string[]
  selectedCount: number
}>()

const emit = defineEmits<{
  (e: 'toggle', id: string): void
  (e: 'clear'): void
}>()

const collapsedCount = 8
const expanded = ref(false)

const visibleItems = computed(() =>
  expanded.value ? props.items : props.items.slice(0, collapsedCount),
)

const isSelected = (id: string) => props.selected.includes(id)
</script>

<style scoped>
.filter-item {
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.filter-item:hover {
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgb(var(--v-theme-on-surface));
}
.filter-item--selected {
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
}
.filter-item--selected:hover {
  background: rgba(var(--v-theme-primary), 0.18);
}
</style>

