<template>
  <div>
    <!-- Connection / Enable Prompt -->
    <v-dialog
      v-model="dialogShown"
      max-width="500"
      persistent
    >
      <v-card class="gamepad-prompt-card">
        <v-card-title class="headline d-flex align-center">
          <v-icon left color="primary" class="mr-2">mdi-gamepad-variant</v-icon>
          {{ $t('gamepad.detectedTitle') }}
        </v-card-title>
        <v-card-text class="py-4">
          {{ $t('gamepad.detectedBody') }}
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            color="secondary"
            variant="text"
            @click="cancelPrompt"
          >
            {{ $t('gamepad.cancelBtn', { btn: buttonBLabel }) }}
          </v-btn>
          <v-btn
            color="primary"
            variant="elevated"
            @click="enableGamepad"
          >
            {{ $t('gamepad.enableBtn', { btn: buttonALabel }) }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Suggest Controller Mod Dialog -->
    <v-dialog
      v-model="modSuggestShown"
      max-width="550"
    >
      <v-card class="gamepad-prompt-card">
        <v-card-title class="headline d-flex align-center">
          <v-icon left color="primary" class="mr-2">mdi-gamepad-variant</v-icon>
          {{ $t('gamepad.modSuggestTitle') }}
        </v-card-title>
        <v-card-text class="py-4">
          <p class="mb-3">{{ $t('gamepad.modSuggestBody') }}</p>
          <v-card
            v-if="suggestedMod"
            variant="outlined"
            class="pa-3 d-flex align-center"
          >
            <v-icon size="36" color="primary" class="mr-3">mdi-puzzle</v-icon>
            <div>
              <div class="text-subtitle-1 font-weight-bold">{{ suggestedMod.name }}</div>
              <div class="text-body-2 opacity-70">{{ suggestedMod.description }}</div>
              <div class="text-caption mt-1 opacity-50">{{ $t('gamepad.modLoader') }}: {{ suggestedMod.loader }}</div>
            </div>
          </v-card>
          <v-alert
            v-if="modInstallError"
            type="error"
            variant="tonal"
            density="compact"
            class="mt-3"
          >
            {{ modInstallError }}
          </v-alert>
          <v-alert
            v-if="modInstallSuccess"
            type="success"
            variant="tonal"
            density="compact"
            class="mt-3"
          >
            {{ $t('gamepad.modInstalled') }}
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            variant="text"
            @click="modSuggestShown = false"
          >
            {{ $t('gamepad.modSkip') }}
          </v-btn>
          <v-btn
            v-if="!modInstallSuccess"
            color="primary"
            variant="elevated"
            :loading="modInstalling"
            @click="installSuggestedMod"
          >
            {{ $t('gamepad.modInstall') }}
          </v-btn>
          <v-btn
            v-else
            color="primary"
            variant="elevated"
            @click="modSuggestShown = false"
          >
            {{ $t('gamepad.modDone') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useNotifier } from '@/composables/notifier'
import { useService } from '@/composables/service'
import { kInstance } from '@/composables/instance'
import { injection } from '@/util/inject'
import { useI18n } from 'vue-i18n'
import {
  InstanceModsServiceKey,
  MarketType,
} from '@xmcl/runtime-api'
import { clientModrinthV2 } from '@/util/clients'

const { t } = useI18n()
const { notify } = useNotifier()
const { installFromMarket } = useService(InstanceModsServiceKey)
const { instance, runtime, path: instancePath } = injection(kInstance)

const dialogShown = ref(false)
const gamepadActive = ref(localStorage.getItem('gamepad_enabled') === 'true')

let animationFrameId: number | null = null
const promptDismissedSession = ref(sessionStorage.getItem('gamepad_prompt_dismissed') === 'true')

// Dynamic gamepad layout / button label detection (SteamDeck/Xbox vs PlayStation)
const gamepadType = ref<'xbox' | 'playstation'>('xbox')
const buttonALabel = computed(() => gamepadType.value === 'playstation' ? '✖' : 'A')
const buttonBLabel = computed(() => gamepadType.value === 'playstation' ? '●' : 'B')

// Controller mod suggestion state
const modSuggestShown = ref(false)
const modInstalling = ref(false)
const modInstallError = ref('')
const modInstallSuccess = ref(false)

// Known controller mods on Modrinth
const CONTROLLER_MODS: Record<string, { slug: string; name: string; description: string; loader: string }> = {
  fabric: {
    slug: 'midnightcontrols',
    name: 'MidnightControls',
    description: 'Full controller support with on-screen hints for Fabric/Quilt',
    loader: 'Fabric',
  },
  quilt: {
    slug: 'midnightcontrols',
    name: 'MidnightControls',
    description: 'Full controller support with on-screen hints for Fabric/Quilt',
    loader: 'Quilt',
  },
  forge: {
    slug: 'controllable',
    name: 'Controllable',
    description: 'Xbox / PlayStation controller support for Forge',
    loader: 'Forge',
  },
  neoforge: {
    slug: 'controllable',
    name: 'Controllable',
    description: 'Xbox / PlayStation controller support for NeoForge',
    loader: 'NeoForge',
  },
}

const detectedLoader = computed(() => {
  const rt = runtime.value
  if (rt.fabricLoader) return 'fabric'
  if (rt.quiltLoader) return 'quilt'
  if (rt.neoForged) return 'neoforge'
  if (rt.forge) return 'forge'
  return null
})

const suggestedMod = computed(() => {
  const loader = detectedLoader.value
  if (!loader) return null
  return CONTROLLER_MODS[loader] ?? null
})

async function installSuggestedMod() {
  const mod = suggestedMod.value
  const loader = detectedLoader.value
  if (!mod || !loader) return

  modInstalling.value = true
  modInstallError.value = ''
  modInstallSuccess.value = false

  try {
    const mcVersion = runtime.value.minecraft
    const loaderFilter = loader === 'neoforge' ? 'neoforge' : loader

    // Find the correct version from Modrinth
    const versions = await clientModrinthV2.getProjectVersions(
      mod.slug,
      { loaders: [loaderFilter], gameVersions: [mcVersion] },
    )

    if (!versions || versions.length === 0) {
      modInstallError.value = t('gamepad.modNotFound', { loader: mod.loader, version: mcVersion })
      return
    }

    // Pick the first (latest) compatible version
    const version = versions[0]

    await installFromMarket({
      market: MarketType.Modrinth,
      version: { versionId: version.id },
      instancePath: instancePath.value,
    })

    modInstallSuccess.value = true
    // Remember that we offered for this instance
    localStorage.setItem(`gamepad_mod_offered_${instancePath.value}`, 'installed')

    notify({
      title: t('gamepad.modSuggestTitle'),
      body: t('gamepad.modInstalledNotify', { name: mod.name }),
      level: 'success',
    })
  } catch (e: any) {
    modInstallError.value = e?.message ?? String(e)
  } finally {
    modInstalling.value = false
  }
}

// Show mod suggestion after enabling gamepad
function maybeSuggestControllerMod() {
  if (!gamepadActive.value) return
  if (!suggestedMod.value) return
  const key = `gamepad_mod_offered_${instancePath.value}`
  if (localStorage.getItem(key)) return
  // Mark as offered so we don't spam the user
  localStorage.setItem(key, 'offered')
  modInstallError.value = ''
  modInstallSuccess.value = false
  modSuggestShown.value = true
}

// Cooldown tracker for repeated inputs
const lastInputTime = ref(0)
const COOLDOWN_MS = 200 // repeat speed
const SCROLL_SPEED = 12 // pixels per frame

// To prevent triggering multiple clicks/escapes per press
const prevButtonsState = ref<boolean[]>([])

// Helper to find all visible, focusable elements
function getFocusableElements(): HTMLElement[] {
  const selector = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), .v-list-item, .v-tab, .v-card, [role="button"], .cursor-pointer, .v-selection-control, .v-switch'
  const elements = Array.from(document.querySelectorAll<HTMLElement>(selector))

  return elements.filter(el => {
    const style = window.getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false
    }

    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      return false
    }

    let parent = el.parentElement
    while (parent) {
      const parentStyle = window.getComputedStyle(parent)
      if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden') {
        return false
      }
      parent = parent.parentElement
    }

    if (el.tabIndex === undefined || el.tabIndex < 0) {
      el.tabIndex = 0
    }
    return true
  })
}

// 2D Spatial Navigation
function moveFocus(direction: 'up' | 'down' | 'left' | 'right') {
  const elements = getFocusableElements()
  if (elements.length === 0) return

  const current = document.activeElement as HTMLElement
  if (!current || !elements.includes(current)) {
    elements[0].focus()
    return
  }

  const curRect = current.getBoundingClientRect()
  const curCenter = {
    x: curRect.left + curRect.width / 2,
    y: curRect.top + curRect.height / 2
  }

  let bestCandidate: HTMLElement | null = null
  let minScore = Infinity

  for (const el of elements) {
    if (el === current) continue
    const rect = el.getBoundingClientRect()
    const center = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    }

    const dx = center.x - curCenter.x
    const dy = center.y - curCenter.y

    if (direction === 'up' && dy >= -1) continue
    if (direction === 'down' && dy <= 1) continue
    if (direction === 'left' && dx >= -1) continue
    if (direction === 'right' && dx <= 1) continue

    let score = 0
    if (direction === 'up' || direction === 'down') {
      score = dy * dy + dx * dx * 5
    } else {
      score = dx * dx + dy * dy * 5
    }

    if (score < minScore) {
      minScore = score
      bestCandidate = el
    }
  }

  if (bestCandidate) {
    bestCandidate.focus()
    bestCandidate.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  } else {
    const index = elements.indexOf(current)
    if (direction === 'down' || direction === 'right') {
      const nextIndex = (index + 1) % elements.length
      elements[nextIndex].focus()
      elements[nextIndex].scrollIntoView({ block: 'nearest', inline: 'nearest' })
    } else {
      const prevIndex = (index - 1 + elements.length) % elements.length
      elements[prevIndex].focus()
      elements[prevIndex].scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }
}

// Find scrollable parent of focused element
function getScrollParent(node: HTMLElement | null): HTMLElement {
  if (node === null) {
    return document.documentElement
  }
  if (node.scrollHeight > node.clientHeight) {
    const overflowY = window.getComputedStyle(node).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') {
      return node
    }
  }
  return getScrollParent(node.parentElement)
}

function enableGamepad() {
  gamepadActive.value = true
  localStorage.setItem('gamepad_enabled', 'true')
  dialogShown.value = false
  notify({
    title: t('gamepad.detectedTitle'),
    body: t('gamepad.enabledNotify', { btnA: buttonALabel.value, btnB: buttonBLabel.value }),
    level: 'success'
  })
  // Suggest controller mod after a short delay
  setTimeout(() => maybeSuggestControllerMod(), 500)
}

// Check if any gamepad is plugged in on mount
function checkInitialGamepads() {
  const gamepads = navigator.getGamepads ? navigator.getGamepads() : []
  for (const gp of gamepads) {
    if (gp && gamepadActive.value) {
      break
    }
  }
}

function cancelPrompt() {
  dialogShown.value = false
  promptDismissedSession.value = true
  sessionStorage.setItem('gamepad_prompt_dismissed', 'true')
}

// Polling loop
function pollGamepads() {
  const gamepads = navigator.getGamepads ? navigator.getGamepads() : []
  let activeGamepad: Gamepad | null = null

  for (const gp of gamepads) {
    if (gp) {
      activeGamepad = gp
      break
    }
  }

  if (activeGamepad) {
    // Detect PlayStation vs Xbox/SteamDeck
    const idLower = activeGamepad.id.toLowerCase()
    if (
      idLower.includes('sony') ||
      idLower.includes('playstation') ||
      idLower.includes('dualsense') ||
      idLower.includes('dualshock') ||
      idLower.includes('ps5') ||
      idLower.includes('ps4') ||
      idLower.includes('ps3') ||
      idLower.includes('wireless controller')
    ) {
      gamepadType.value = 'playstation'
    } else {
      gamepadType.value = 'xbox'
    }

    // If not enabled and not dismissed in session, show the prompt
    if (!gamepadActive.value && !promptDismissedSession.value && !dialogShown.value) {
      const anyButtonPressed = activeGamepad.buttons.some(b => b.pressed)
      if (anyButtonPressed) {
        dialogShown.value = true
      }
    }

    const now = performance.now()
    const buttons = activeGamepad.buttons
    const axes = activeGamepad.axes

    if (prevButtonsState.value.length === 0) {
      prevButtonsState.value = new Array(buttons.length).fill(false)
    }

    // Check Button A (Confirm) - standard mapping button 0
    if (buttons[0] && buttons[0].pressed && !prevButtonsState.value[0]) {
      if (dialogShown.value) {
        enableGamepad()
      } else if (gamepadActive.value) {
        const current = document.activeElement as HTMLElement
        if (current) {
          current.click()
        }
      }
    }

    // Check Button B (Cancel/Back) - standard mapping button 1
    if (buttons[1] && buttons[1].pressed && !prevButtonsState.value[1]) {
      if (dialogShown.value) {
        cancelPrompt()
      } else if (gamepadActive.value) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      }
    }

    // Directional inputs (Navigation)
    if (gamepadActive.value && !dialogShown.value) {
      const dpadUp = buttons[12]?.pressed
      const dpadDown = buttons[13]?.pressed
      const dpadLeft = buttons[14]?.pressed
      const dpadRight = buttons[15]?.pressed

      const stickX = axes[0]
      const stickY = axes[1]

      let dir: 'up' | 'down' | 'left' | 'right' | null = null

      if (dpadUp || stickY < -0.5) dir = 'up'
      else if (dpadDown || stickY > 0.5) dir = 'down'
      else if (dpadLeft || stickX < -0.5) dir = 'left'
      else if (dpadRight || stickX > 0.5) dir = 'right'

      if (dir && now - lastInputTime.value > COOLDOWN_MS) {
        moveFocus(dir)
        lastInputTime.value = now
      }

      // Right stick scrolling
      const rStickY = axes[3] || axes[2]
      if (rStickY && Math.abs(rStickY) > 0.2) {
        const scrollContainer = getScrollParent(document.activeElement as HTMLElement)
        if (scrollContainer) {
          scrollContainer.scrollTop += rStickY * SCROLL_SPEED
        }
      }
    }

    // Update button states
    for (let i = 0; i < buttons.length; i++) {
      prevButtonsState.value[i] = buttons[i].pressed
    }
  }

  animationFrameId = requestAnimationFrame(pollGamepads)
}

// Watch for active state to toggle CSS class
watch(gamepadActive, (active) => {
  if (active) {
    document.documentElement.classList.add('gamepad-active')
  } else {
    document.documentElement.classList.remove('gamepad-active')
  }
}, { immediate: true })

// When instance changes and gamepad is active, suggest the mod if applicable
watch(instancePath, () => {
  if (gamepadActive.value) {
    maybeSuggestControllerMod()
  }
})

onMounted(() => {
  checkInitialGamepads()
  animationFrameId = requestAnimationFrame(pollGamepads)
  window.addEventListener('gamepadconnected', () => {
    promptDismissedSession.value = false
    sessionStorage.removeItem('gamepad_prompt_dismissed')
  })
  // On mount, suggest mod if gamepad was already enabled
  if (gamepadActive.value) {
    setTimeout(() => maybeSuggestControllerMod(), 1000)
  }
})

onUnmounted(() => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
  }
})
</script>

<style>
/* Global gamepad active styling */
.gamepad-active :focus-visible,
.gamepad-active :focus,
.gamepad-active .v-btn:focus,
.gamepad-active .v-list-item:focus,
.gamepad-active .v-card:focus {
  outline: 3px solid #ffaa00 !important;
  outline-offset: 2px !important;
  box-shadow: 0 0 10px rgba(255, 170, 0, 0.6) !important;
  border-radius: 4px !important;
  transition: outline-offset 0.1s ease, box-shadow 0.1s ease !important;
}

.gamepad-prompt-card {
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(30, 30, 30, 0.85) !important;
  backdrop-filter: blur(10px);
}
</style>
