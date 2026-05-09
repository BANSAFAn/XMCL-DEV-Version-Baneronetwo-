<template>
  <v-list-item
    :title="t('setting.instanceTheme.name')"
    :subtitle="
      !instanceTheme
        ? t('setting.instanceTheme.description')
        : t('setting.instanceTheme.activeDescription')
    "
    class="items-center justify-center"
  >
    <template #append>
      <v-list-item-action>
        <v-switch :input-value="!!instanceTheme" @change="toggleInstanceTheme" />
      </v-list-item-action>
    </template>
  </v-list-item>
  <AppearanceItems
    v-if="instanceTheme"
    :theme="instanceTheme"
    dense
    :instance-path="instancePath"
    @save="onSave"
  />
</template>
<script lang="ts" setup>
import AppearanceItems from '@/components/AppearanceItems.vue'
import { kInstance } from '@/composables/instance'
import { kInstanceTheme } from '@/composables/instanceTheme'
import { useService } from '@/composables/service'
import { kTheme } from '@/composables/theme'
import { injection } from '@/util/inject'
import { InstanceThemeServiceKey } from '@xmcl/runtime-api'

const { t } = useI18n()
const { path: instancePath } = injection(kInstance)
const { instanceTheme, saveTheme, clearTheme } = injection(kInstanceTheme)
const { currentTheme } = injection(kTheme)
const { copyMediaFromGlobal } = useService(InstanceThemeServiceKey)

async function toggleInstanceTheme(enabled: boolean) {
  if (enabled) {
    // Create a deep copy of the current global theme
    const themeCopy = JSON.parse(JSON.stringify(currentTheme.value))
    // Copy media files to instance theme folder
    if (themeCopy.backgroundImage?.url?.startsWith('http://launcher/theme-media/')) {
      try {
        const newMedia = await copyMediaFromGlobal(
          instancePath.value,
          themeCopy.backgroundImage.url,
        )
        themeCopy.backgroundImage = newMedia
      } catch {
        themeCopy.backgroundImage = undefined
      }
    }
    if (themeCopy.font?.url?.startsWith('http://launcher/theme-media/')) {
      try {
        const newMedia = await copyMediaFromGlobal(instancePath.value, themeCopy.font.url)
        themeCopy.font = newMedia
      } catch {
        themeCopy.font = undefined
      }
    }
    if (themeCopy.backgroundMusic?.length > 0) {
      const newMusic = []
      for (const music of themeCopy.backgroundMusic) {
        if (music?.url?.startsWith('http://launcher/theme-media/')) {
          try {
            const newMedia = await copyMediaFromGlobal(instancePath.value, music.url)
            newMusic.push(newMedia)
          } catch {
            // Skip failed copies
          }
        }
      }
      themeCopy.backgroundMusic = newMusic
    }
    instanceTheme.value = themeCopy
    await saveTheme()
  } else {
    await clearTheme()
  }
}

function onSave() {
  saveTheme()
}
</script>
