<template>
  <div class="flex flex-col overflow-hidden">
    <div class="relative flex items-center px-4 pt-3">
      <v-btn
        icon="arrow_back"
        variant="text"
        density="comfortable"
        @click="$emit('back')"
      />
      <span class="ml-2 text-base font-medium">{{ t('userService.title') }}</span>
    </div>
    <div class="p-6 flex flex-col gap-4 text-left overflow-auto">
      <v-card
        v-for="(a, i) in items"
        :key="i"
        variant="outlined"
        rounded="xl"
        class="overflow-hidden"
      >
        <div class="flex gap-3 flex-row items-center px-4 pt-4">
          <v-text-field
            v-if="a.new"
            v-model="a.url"
            autofocus
            :readonly="!a.new"
            variant="outlined"
            prepend-inner-icon="link"
            hide-details
            density="comfortable"
            :label="t('userService.baseUrlHint')"
            class="flex-1"
          />
          <div
            v-else-if="resolvePreview(a.url)"
            class="flex-grow rounded-lg border border-dashed border-outline-variant px-3 py-2 text-xs text-medium-emphasis"
          >
            <div class="text-[11px] uppercase tracking-wide text-disabled">
              {{ t('userService.baseUrlHint') }}
            </div>
            <div class="font-mono break-all text-sm">{{ resolvePreview(a.url) }}</div>
          </div>
          <v-btn
            v-if="a.new"
            icon="add"
            variant="tonal"
            density="comfortable"
            color="primary"
            @click="save(a)"
          />
          <v-btn
            v-else
            icon="delete"
            variant="tonal"
            density="comfortable"
            color="error"
            @click="remove(a)"
          />
        </div>

        <v-card
          variant="tonal"
          rounded="lg"
          class="mx-4 my-4 px-4 py-3"
        >
          <template v-if="a.authlibInjector">
            <div class="text-sm font-medium flex items-center gap-2">
              <img
                v-if="a.favicon"
                :src="a.favicon"
                alt="favicon"
                class="h-5 w-5 rounded-sm"
              >
              {{ t('userService.authlibInjectorMetadata') }}
            </div>
            <div class="mt-3 grid gap-2 text-sm md:grid-cols-2">
              <div>
                <div class="text-[11px] uppercase tracking-wide text-disabled">{{ t('userService.server') }}</div>
                <div class="font-mono">{{ a.authlibInjector.meta?.serverName || '-' }}</div>
              </div>
              <div>
                <div class="text-[11px] uppercase tracking-wide text-disabled">{{ t('userService.implementation') }}</div>
                <div class="font-mono">{{ a.authlibInjector.meta?.implementationName || '-' }}</div>
              </div>
              <div>
                <div class="text-[11px] uppercase tracking-wide text-disabled">{{ t('userService.version') }}</div>
                <div class="font-mono">{{ a.authlibInjector.meta?.implementationVersion || '-' }}</div>
              </div>
              <div v-if="a.authlibInjector.skinDomains?.length">
                <div class="text-[11px] uppercase tracking-wide text-disabled">{{ t('userService.skinDomains') }}</div>
                <div class="font-mono break-words flex flex-wrap gap-1">
                  <v-chip
                    v-for="(domain, idx) in getVisibleSkinDomains(a.authlibInjector.skinDomains)"
                    :key="domain + idx"
                    size="x-small"
                    variant="flat"
                    label
                  >
                    {{ domain }}
                  </v-chip>
                  <v-chip
                    v-if="getHiddenSkinDomains(a.authlibInjector.skinDomains).length"
                    v-shared-tooltip="() => getHiddenSkinDomains(a.authlibInjector.skinDomains).join('\n')"
                    size="x-small"
                    variant="tonal"
                    label
                  >
                    +{{ getHiddenSkinDomains(a.authlibInjector.skinDomains).length }}
                  </v-chip>
                </div>
              </div>
            </div>
            <div class="mt-3 grid gap-2 text-sm md:grid-cols-2">
              <div>
                <div class="text-[11px] uppercase tracking-wide text-disabled">{{ t('userService.homepage') }}</div>
                <a
                  v-if="a.authlibInjector.meta?.links?.homepage"
                  :href="a.authlibInjector.meta.links.homepage"
                  target="browser"
                  class="text-primary underline break-all"
                >
                  {{ a.authlibInjector.meta.links.homepage }}
                </a>
                <span v-else class="text-disabled">-</span>
              </div>
              <div>
                <div class="text-[11px] uppercase tracking-wide text-disabled">{{ t('userService.register') }}</div>
                <a
                  v-if="a.authlibInjector.meta?.links?.register"
                  :href="a.authlibInjector.meta.links.register"
                  target="browser"
                  class="text-primary underline break-all"
                >
                  {{ a.authlibInjector.meta.links.register }}
                </a>
                <span v-else class="text-disabled">-</span>
              </div>
            </div>
          </template>
          <template v-else>
            <div class="text-sm text-medium-emphasis">
              {{ t('userService.title') }}
            </div>
          </template>
        </v-card>
      </v-card>
    </div>
  </div>
</template>
<script setup lang="ts">
import { useService } from '@/composables'
import { kSupportedAuthorityMetadata } from '@/composables/yggrasil'
import { vSharedTooltip } from '@/directives/sharedTooltip'
import { injection } from '@/util/inject'
import { UserServiceKey } from '@xmcl/runtime-api'
import { Ref, ref, watch } from 'vue'

defineEmits<{
  (e: 'back'): void
}>()

const { data: services, mutate } = injection(kSupportedAuthorityMetadata)

type AuthorityItem = {
  new?: boolean
  url: string
  isConnect?: boolean
  authlibInjector?: any
  favicon?: string
  flow?: string[]
}

const items: Ref<(AuthorityItem)[]> = ref([])
watch(services, (s) => {
  if (!s) return
  items.value = s.filter(api => api.kind === 'yggdrasil').map(api => ({
    url: api.authority,
    new: false,
    isConnect: false,
    authlibInjector: api.authlibInjector,
    favicon: api.favicon,
    flow: api.flow,
  }))
  // When entering the view for editing (e.g. from add button), automatically add a new editable item
  if (items.value.every(v => !v.new)) {
    items.value.unshift({ url: '', new: true })
  }
}, { immediate: true })

const { addYggdrasilService, removeYggdrasilService } = useService(UserServiceKey)
const { t } = useI18n()

const addNew = () => {
  if (items.value?.every(v => !v.new)) {
    items.value.push({ url: '', new: true })
  }
}

const isValidUrl = (s: string) => {
  try {
    const u = new URL(s)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch (e) { return false }
}

const normalizeInputToUrl = (input: string) => {
  const s = (input || '').trim()
  if (!s) return ''
  try {
    const u = new URL(s)
    const path = u.pathname.replace(/\/+$/, '')
    if (path.endsWith('/api/yggdrasil')) return u.toString()
    if (u.pathname === '' || u.pathname === '/') {
      u.pathname = '/api/yggdrasil'
      return u.toString()
    }
    return u.toString()
  } catch (e) {
    try {
      const u = new URL('https://' + s)
      if (u.pathname === '' || u.pathname === '/') {
        u.pathname = '/api/yggdrasil'
        return u.toString()
      }
      return u.toString()
    } catch (e2) {
      return ''
    }
  }
}

const MAX_SKIN_DOMAINS_DISPLAY = 10
const getVisibleSkinDomains = (domains?: string[]) => (domains || []).slice(0, MAX_SKIN_DOMAINS_DISPLAY)
const getHiddenSkinDomains = (domains?: string[]) => (domains || []).slice(MAX_SKIN_DOMAINS_DISPLAY)

const save = async (api: AuthorityItem) => {
  const url = normalizeInputToUrl(api.url)
  if (!url) return
  await addYggdrasilService(url)
  mutate()
}
const remove = async (api: AuthorityItem) => {
  const url = normalizeInputToUrl(api.url) || api.url
  await removeYggdrasilService(url)
  mutate()
}

const resolvePreview = (v: string) => normalizeInputToUrl(v) || ''
</script>
