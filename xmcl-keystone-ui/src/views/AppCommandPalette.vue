<template>
  <v-dialog
    v-model="isShown"
    width="720"
    max-width="92vw"
    transition="dialog-top-transition"
    scrollable
  >
    <v-card
      class="palette-card flex max-h-[75vh] flex-col overflow-hidden"
      rounded="xl"
      elevation="24"
    >
      <v-text-field
        ref="searchInput"
        v-model="query"
        :placeholder="t('commandPalette.placeholder')"
        prepend-inner-icon="search"
        variant="solo"
        density="comfortable"
        rounded="lg"
        flat
        bg-color="transparent"
        hide-details
        autofocus
        class="pa-3"
        @keydown.down.prevent="moveSelection(1)"
        @keydown.up.prevent="moveSelection(-1)"
        @keydown.right="onArrowRight"
        @keydown.left="onArrowLeft"
        @keydown.enter.prevent="invokeSelected"
        @keydown.esc="hide"
      />

      <v-divider />

      <v-list
        ref="resultsList"
        density="compact"
        nav
        class="palette-list flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2 py-2"
      >
        <template v-if="recentResults.length > 0">
          <v-list-subheader>{{ t('commandPalette.recent') }}</v-list-subheader>
          <v-list-item
            v-for="(inst, idx) in recentResults"
            :key="`recent-${inst.path}`"
            :active="selectedIndex === idx"
            :data-palette-index="idx"
            @click="launchInstance(inst)"
            @mouseenter="selectedIndex = idx"
          >
            <template #prepend>
              <v-avatar size="36" rounded="lg" class="palette-avatar">
                <v-img
                  v-fallback-img="BuiltinImages.craftingTable"
                  :src="getInstanceIcon(inst, undefined)"
                />
              </v-avatar>
            </template>
            <v-list-item-title>{{ inst.name }}</v-list-item-title>
            <v-list-item-subtitle>{{ inst.runtime.minecraft }} · {{ inst.path }}</v-list-item-subtitle>
            <template #append>
              <v-icon size="small" color="primary">play_arrow</v-icon>
            </template>
          </v-list-item>
        </template>

        <template v-if="commandResults.length > 0">
          <v-list-subheader>{{ t('commandPalette.commands') }}</v-list-subheader>
          <v-list-item
            v-for="(c, idx) in commandResults"
            :key="c.id"
            :active="selectedIndex === recentResults.length + idx"
            :data-palette-index="recentResults.length + idx"
            @click="invoke(c)"
            @mouseenter="selectedIndex = recentResults.length + idx"
          >
            <template #prepend>
              <div class="palette-cmd-icon">
                <v-icon size="18">{{ c.ui?.icon || 'play_arrow' }}</v-icon>
              </div>
            </template>
            <v-list-item-title>{{ c.title }}</v-list-item-title>
            <v-list-item-subtitle>{{ c.id }}</v-list-item-subtitle>
          </v-list-item>
        </template>

        <template v-if="instanceResults.length > 0">
          <v-list-subheader>{{ t('commandPalette.instances') }}</v-list-subheader>
          <v-list-item
            v-for="(inst, idx) in instanceResults"
            :key="inst.path"
            :active="selectedIndex === recentResults.length + commandResults.length + idx"
            :data-palette-index="recentResults.length + commandResults.length + idx"
            @click="launchInstance(inst)"
            @mouseenter="selectedIndex = recentResults.length + commandResults.length + idx"
          >
            <template #prepend>
              <v-avatar size="36" rounded="lg" class="palette-avatar">
                <v-img
                  v-fallback-img="BuiltinImages.craftingTable"
                  :src="getInstanceIcon(inst, undefined)"
                />
              </v-avatar>
            </template>
            <v-list-item-title>{{ inst.name }}</v-list-item-title>
            <v-list-item-subtitle>{{ inst.runtime.minecraft }} · {{ inst.path }}</v-list-item-subtitle>
            <template #append>
              <v-icon
                size="small"
                :color="instanceActionColor"
              >
                {{ instanceActionIcon }}
              </v-icon>
            </template>
          </v-list-item>
        </template>

        <template v-if="modrinthResults.length > 0">
          <v-list-subheader>{{ t('commandPalette.modrinth') }}</v-list-subheader>
          <v-list-item
            v-for="(p, idx) in modrinthResults"
            :key="p.project_id"
            :active="selectedIndex === recentResults.length + commandResults.length + instanceResults.length + idx"
            :data-palette-index="recentResults.length + commandResults.length + instanceResults.length + idx"
            @click="openModrinthProject(p)"
            @mouseenter="selectedIndex = recentResults.length + commandResults.length + instanceResults.length + idx"
          >
            <template #prepend>
              <v-avatar size="36" rounded="lg" class="palette-avatar">
                <v-img v-if="p.icon_url" :src="p.icon_url" />
                <v-icon v-else>{{ getProjectTypeIcon(p.project_type) }}</v-icon>
              </v-avatar>
            </template>
            <v-list-item-title>{{ p.title }}</v-list-item-title>
            <v-list-item-subtitle>{{ p.description }}</v-list-item-subtitle>
            <template #append>
              <v-chip
                size="x-small"
                variant="tonal"
                label
                :color="getProjectTypeColor(p.project_type)"
              >
                <v-icon start size="x-small">{{ getProjectTypeIcon(p.project_type) }}</v-icon>
                {{ getProjectTypeLabel(p.project_type) }}
              </v-chip>
            </template>
          </v-list-item>
        </template>

        <v-list-item
          v-if="!hasAnyResult && !isSearchingMarket"
          disabled
        >
          <v-list-item-title class="text-medium-emphasis">
            {{ query.trim() ? t('commandPalette.noResults') : t('commandPalette.empty') }}
          </v-list-item-title>
        </v-list-item>

        <v-list-item v-if="isSearchingMarket" disabled>
          <v-list-item-title class="text-medium-emphasis">
            {{ t('commandPalette.searching') }}
          </v-list-item-title>
        </v-list-item>
      </v-list>

      <v-divider />

      <div class="palette-footer px-4 py-2 text-medium-emphasis text-caption flex items-center gap-2 flex-wrap">
        <span class="palette-footer__group">
          <kbd>↑</kbd><kbd>↓</kbd>
          <span class="palette-footer__label">{{ t('commandPalette.hintNavigate') }}</span>
        </span>
        <span class="palette-footer__group">
          <kbd>Enter</kbd>
          <span class="palette-footer__label">{{ t('commandPalette.hintInvoke') }}</span>
        </span>
        <span v-if="pendingInstanceAction" class="palette-footer__group">
          <kbd>←</kbd>
          <span class="palette-footer__label">{{ t('commandPalette.hintBack') }}</span>
        </span>
        <span v-else-if="isSelectedCommandMultiStep" class="palette-footer__group">
          <kbd>→</kbd>
          <span class="palette-footer__label">{{ t('commandPalette.hintEnter') }}</span>
        </span>
        <span class="palette-footer__group">
          <kbd>Esc</kbd>
          <span class="palette-footer__label">{{ t('commandPalette.hintClose') }}</span>
        </span>
        <v-spacer />
        <span class="palette-footer__group">
          <kbd>Ctrl</kbd><kbd>K</kbd>
        </span>
      </div>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import { useNotifier } from '@/composables/notifier'
import { useCommandPaletteBus } from '@/composables/commandPalette'
import { useRendererCommandHost } from '@/composables/commandHost'
import { kInstance } from '@/composables/instance'
import { kInstances } from '@/composables/instances'
import { useModrinthSearchFunc } from '@/composables/modrinth'
import { BuiltinImages } from '@/constant'
import { vFallbackImg } from '@/directives/fallbackImage'
import { getInstanceIcon } from '@/util/favicon'
import { injection } from '@/util/inject'
import { useDebounce } from '@vueuse/core'
import type { Instance } from '@xmcl/instance'
import type { SearchResultHit } from '@xmcl/modrinth'
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const isShown = ref(false)
const query = ref('')
const debouncedQuery = useDebounce(query, 250)
const selectedIndex = ref(0)
const router = useRouter()
const bus = useCommandPaletteBus()
const { notify } = useNotifier()

const host = useRendererCommandHost()
const instanceCtx = injection(kInstance)
const instancesCtx = injection(kInstances)
const pendingInstanceAction = ref<'instance.launch' | 'instance.delete' | undefined>(undefined)

bus.on((event) => {
  if (event === 'show') isShown.value = true
  else if (event === 'hide') isShown.value = false
  else isShown.value = !isShown.value
})

watch(isShown, (v) => {
  if (v) {
    query.value = ''
    selectedIndex.value = 0
    pendingInstanceAction.value = undefined
  }
})

function hide() {
  isShown.value = false
  pendingInstanceAction.value = undefined
}

// ── Internal commands ────────────────────────────────────────────────────────
const allCommands = computed(() =>
  host.list()
)

function fuzzyMatches(haystack: string, needle: string): boolean {
  if (!needle) return true
  const h = haystack.toLowerCase()
  const n = needle.toLowerCase()
  let i = 0
  for (const ch of h) {
    if (ch === n[i]) i++
    if (i === n.length) return true
  }
  return false
}

const commandResults = computed(() => {
  if (pendingInstanceAction.value) return []
  const q = query.value.trim()
  return allCommands.value.filter((c) =>
    fuzzyMatches(c.title, q) || fuzzyMatches(c.id, q),
  ).slice(0, 8)
})

// ── Recent instances ((default view only) ─────────────────────────────────────
const recentResults = computed(() => {
  if (pendingInstanceAction.value) return []
  if (query.value.trim()) return []
  return [...instancesCtx.instances.value]
    .filter((i) => (i.lastPlayedDate ?? 0) > 0)
    .sort((a, b) => (b.lastPlayedDate ?? 0) - (a.lastPlayedDate ?? 0))
    .slice(0, 5)
})

// ── Instance results ─────────────────────────────────────────────────────────
const instanceResults = computed(() => {
  const currentPath = instanceCtx.path.value
  const sorted = [...instancesCtx.instances.value].sort((left, right) => {
    if (left.path === currentPath) return -1
    if (right.path === currentPath) return 1
    return left.name.localeCompare(right.name)
  })
  const q = query.value.trim()
  if (!pendingInstanceAction.value && !q) return []
  const filtered = sorted.filter((i) =>
    !q || fuzzyMatches(i.name, q) || fuzzyMatches(i.path, q),
  )
  return pendingInstanceAction.value ? filtered : filtered.slice(0, 5)
})

// ── Modrinth search ──────────────────────────────────────────────────────────
const searchModrinth = useModrinthSearchFunc(
  computed(() => debouncedQuery.value.trim()),
  ref(''),
  ref(''),
  ref([] as string[]),
  ref([] as string[]),
  ref(''),
  ref(undefined as string | undefined),
  ref(''),
  ref(8),
)

const modrinthResults = ref<SearchResultHit[]>([])
const isSearchingMarket = ref(false)

watch(debouncedQuery, async (q) => {
  modrinthResults.value = []
  if (!isShown.value) return
  if (pendingInstanceAction.value) return
  if (!q || q.length < 2) return
  isSearchingMarket.value = true
  try {
    const r = await searchModrinth(0)
    modrinthResults.value = r.hits
  } catch {
    // Silently ignore network errors — palette stays usable.
  } finally {
    isSearchingMarket.value = false
  }
})

// ── Selection / invocation ───────────────────────────────────────────────────
const totalResultCount = computed(() => recentResults.value.length + commandResults.value.length + instanceResults.value.length + modrinthResults.value.length)
const hasAnyResult = computed(() => totalResultCount.value > 0)

watch([recentResults, commandResults, instanceResults, modrinthResults], () => {
  if (selectedIndex.value >= totalResultCount.value) selectedIndex.value = 0
})

function moveSelection(delta: number) {
  const total = totalResultCount.value
  if (total === 0) return
  selectedIndex.value = (selectedIndex.value + delta + total) % total
}

const resultsList = ref<{ $el: HTMLElement } | null>(null)

watch(selectedIndex, (idx) => {
  nextTick(() => {
    const root = resultsList.value?.$el as HTMLElement | undefined
    if (!root) return
    const target = root.querySelector(`[data-palette-index="${idx}"]`) as HTMLElement | null
    target?.scrollIntoView({ block: 'nearest' })
  })
})

async function invoke(c: { id: string }) {
  if (c.id === 'instance.launch' || c.id === 'instance.delete') {
    pendingInstanceAction.value = c.id
    query.value = ''
    selectedIndex.value = 0
    return
  }

  hide()
  try {
    await host.dispatch(c.id, {})
  } catch (e) {
    notify({ title: e instanceof Error ? e.message : String(e), level: 'error' })
  }
}

async function launchInstance(inst: Instance) {
  const commandId = pendingInstanceAction.value ?? 'instance.launch'
  hide()
  try {
    await host.dispatch(commandId, { instance: inst.path })
  } catch (e) {
    notify({ title: e instanceof Error ? e.message : String(e), level: 'error' })
  }
}

async function openModrinthProject(p: SearchResultHit) {
  hide()
  await nextTick()
  const localRoute = localPageForProjectType(p.project_type)
  if (localRoute) {
    await router.push({
      path: localRoute,
      query: {
        source: 'remote',
        keyword: p.title,
        id: `modrinth:${p.project_id}`,
      },
    })
  } else {
    await router.push(`/store/modrinth/${p.project_id}`)
  }
}

function localPageForProjectType(type: string): string | undefined {
  switch (type) {
    case 'mod': return '/mods'
    case 'resourcepack': return '/resourcepacks'
    case 'shader': return '/shaderpacks'
    default: return undefined
  }
}

function invokeSelected() {
  const recentLen = recentResults.value.length
  const cmdLen = commandResults.value.length
  const instLen = instanceResults.value.length
  const idx = selectedIndex.value
  if (idx < recentLen) {
    launchInstance(recentResults.value[idx])
  } else if (idx < recentLen + cmdLen) {
    invoke(commandResults.value[idx - recentLen])
  } else if (idx < recentLen + cmdLen + instLen) {
    launchInstance(instanceResults.value[idx - recentLen - cmdLen])
  } else if (idx < recentLen + cmdLen + instLen + modrinthResults.value.length) {
    openModrinthProject(modrinthResults.value[idx - recentLen - cmdLen - instLen])
  }
}

const multiStepCommandIds = new Set(['instance.launch', 'instance.delete'])

const projectTypeMeta: Record<string, { icon: string; color: string; label: string }> = {
  mod: { icon: 'extension', color: 'primary', label: 'Mod' },
  modpack: { icon: 'inventory_2', color: 'orange', label: 'Modpack' },
  resourcepack: { icon: 'palette', color: 'purple', label: 'Resource Pack' },
  shader: { icon: 'wb_sunny', color: 'amber', label: 'Shader' },
  datapack: { icon: 'data_object', color: 'teal', label: 'Datapack' },
  plugin: { icon: 'power', color: 'green', label: 'Plugin' },
}

function getProjectTypeIcon(type: string) {
  return projectTypeMeta[type]?.icon ?? 'extension'
}
function getProjectTypeColor(type: string) {
  return projectTypeMeta[type]?.color ?? 'grey'
}
function getProjectTypeLabel(type: string) {
  return projectTypeMeta[type]?.label ?? type
}

const instanceActionIcon = computed(() => pendingInstanceAction.value === 'instance.delete' ? 'delete' : 'play_arrow')
const instanceActionColor = computed(() => pendingInstanceAction.value === 'instance.delete' ? 'error' : 'primary')

const isSelectedCommandMultiStep = computed(() => {
  if (pendingInstanceAction.value) return false
  const cmd = commandResults.value[selectedIndex.value - recentResults.value.length]
  return !!cmd && multiStepCommandIds.has(cmd.id)
})

function onArrowRight(e: KeyboardEvent) {
  if (pendingInstanceAction.value) return
  const cmd = commandResults.value[selectedIndex.value - recentResults.value.length]
  if (!cmd || !multiStepCommandIds.has(cmd.id)) return
  e.preventDefault()
  invoke(cmd)
}

function onArrowLeft(e: KeyboardEvent) {
  if (!pendingInstanceAction.value) return
  const target = e.target as HTMLInputElement | null
  // Allow normal cursor movement when there's text and the cursor isn't at the start.
  if (target && target.value && (target.selectionStart ?? 0) > 0) return
  e.preventDefault()
  pendingInstanceAction.value = undefined
  query.value = ''
  selectedIndex.value = 0
}
</script>

<style scoped>
.palette-card {
  border-radius: 18px;
}

.palette-list :deep(.v-list-item) {
  border-radius: 12px;
  margin-bottom: 2px;
  min-height: 48px;
  transition: background-color 120ms ease, transform 120ms ease;
}

.palette-list :deep(.v-list-subheader) {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  opacity: 0.55;
  min-height: 24px;
  padding-inline-start: 12px;
  padding-inline-end: 12px;
  margin-top: 4px;
}

.palette-list :deep(.v-list-item--active .v-list-item__overlay) {
  opacity: 0.12;
}

.palette-list :deep(.v-list-item__prepend) {
  margin-inline-end: 12px;
}

.palette-list :deep(.v-list-item__prepend > .v-list-item__spacer) {
  width: 12px;
}

.palette-avatar {
  background: rgba(125, 125, 125, 0.12);
}

.palette-cmd-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: rgba(125, 125, 125, 0.14);
  color: rgb(var(--v-theme-on-surface));
}

.palette-footer {
  background: rgb(var(--v-theme-surface-bright, var(--v-theme-surface)) / 0.4);
}

.palette-footer__group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.palette-footer__label {
  margin-left: 2px;
  opacity: 0.8;
}

kbd {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 0.7rem;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 6px;
  border: 1px solid rgba(125, 125, 125, 0.28);
  background: rgba(125, 125, 125, 0.14);
  min-width: 18px;
  text-align: center;
}
</style>
