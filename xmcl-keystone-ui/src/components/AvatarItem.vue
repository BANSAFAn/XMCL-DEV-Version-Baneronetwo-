<template>
  <div
    class="flex flex-grow-0 items-center rounded pr-2 text-sm"
    :class="{ 'cursor-pointer': hasClickHandler }"
    @click="onclick ? onclick($event) : emit('click', $event)"
  >
    <v-avatar
      class="mr-2 hidden lg:block"
      :size="34"
      color="transparent"
      :class="{ responsive }"
    >
      <v-img
        v-if="avatar"
        :src="avatar"
        :width="34"
        :height="34"
      />
      <v-icon v-else-if="icon" :size="24">
        {{ icon }}
      </v-icon>
    </v-avatar>

    <div
      v-if="text"
      class="text overflow-hidden overflow-ellipsis whitespace-nowrap"
    >
      <div
        class="select-none font-semibold dark:text-gray-300"
        :style="{
          color: bgColor
        }"
      >
        {{ title }}
      </div>
      {{ text }}
    </div>
  </div>
</template>
<script lang="ts" setup>
import { useVuetifyColor } from '@/composables/vuetify'

export interface AvatarItemProps {
  color?: string
  avatar?: string
  icon?: string
  title?: string
  text?: string
  responsive?: boolean
  onclick?: (e: Event) => void
}
const props = defineProps<AvatarItemProps>()
const { getColorCode } = useVuetifyColor()
const bgColor = computed(() => props.color ? getColorCode(props.color) : undefined)
const emit = defineEmits(['click'])
const attrs = useAttrs()
const hasClickHandler = computed(() => !!attrs.onClick || !!props.onclick)
</script>
<style scoped>

.responsive {
  display: none !important;
}
.text {
  padding-left: 0.5rem;
}
@media (min-width: 1000px) {
  /* Use inline-flex (Vuetify 4 v-avatar default) so the icon centers vertically. */
  .responsive {
    display: inline-flex !important;
  }
  .text {
  }
}
</style>
