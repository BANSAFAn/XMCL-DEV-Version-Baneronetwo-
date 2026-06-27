<template>
  <div>
    <!-- Gamepad Detection / Enable Prompt -->
    <v-dialog
      v-model="dialogShown"
      max-width="480"
      persistent
      transition="fade-transition"
      content-class="elevation-0"
    >
      <div class="gp-dialog">
        <!-- Animated header glow -->
        <div class="gp-dialog__glow gp-dialog__glow--primary" />

        <div class="gp-dialog__content">
          <!-- Icon badge -->
          <div class="gp-dialog__icon-wrap">
            <div class="gp-dialog__icon-badge gp-dialog__icon-badge--primary">
              <v-icon size="28" color="primary">mdi-gamepad-variant</v-icon>
            </div>
          </div>

          <div class="text-lg font-bold tracking-tight mt-4 mb-1" style="color: rgba(var(--v-theme-on-surface), 0.95)">
            {{ $t('gamepad.detectedTitle') }}
          </div>

          <p class="text-sm mb-6" style="color: rgba(var(--v-theme-on-surface), 0.55); line-height: 1.6;">
            {{ $t('gamepad.detectedBody') }}
          </p>

          <!-- Controller type badge -->
          <div class="gp-chip mb-6">
            <v-icon size="14" class="mr-1" style="opacity:0.7">
              {{ gamepadType === 'playstation' ? 'mdi-sony-playstation' : 'mdi-microsoft-xbox-controller' }}
            </v-icon>
            <span class="text-xs font-medium" style="opacity:0.7">
              {{ gamepadType === 'playstation' ? 'PlayStation' : 'Xbox / Steam Deck' }}
            </span>
          </div>

          <!-- Actions -->
          <div class="flex gap-3 w-full">
            <v-btn
              class="flex-1 gp-btn gp-btn--secondary"
              variant="flat"
              size="large"
              @click="cancelPrompt"
            >
              <span class="gp-btn__key mr-2">{{ buttonBLabel }}</span>
              {{ $t('gamepad.cancelBtn', { btn: '' }).replace('()', '').trim() }}
            </v-btn>
            <v-btn
              class="flex-1 gp-btn gp-btn--primary"
              variant="flat"
              size="large"
              @click="enableGamepad"
            >
              <span class="gp-btn__key gp-btn__key--primary mr-2">{{ buttonALabel }}</span>
              {{ $t('gamepad.enableBtn', { btn: '' }).replace('()', '').trim() }}
            </v-btn>
          </div>
        </div>
      </div>
    </v-dialog>

    <!-- Suggest Controller Mod Dialog -->
    <v-dialog
      v-model="modSuggestShown"
      max-width="500"
      transition="fade-transition"
      content-class="elevation-0"
    >
      <div class="gp-dialog">
        <div class="gp-dialog__glow gp-dialog__glow--accent" />

        <div class="gp-dialog__content">
          <!-- Icon badge -->
          <div class="gp-dialog__icon-wrap">
            <div class="gp-dialog__icon-badge gp-dialog__icon-badge--accent">
              <v-icon size="28">mdi-puzzle-outline</v-icon>
            </div>
          </div>

          <div class="text-lg font-bold tracking-tight mt-4 mb-1" style="color: rgba(var(--v-theme-on-surface), 0.95)">
            {{ $t('gamepad.modSuggestTitle') }}
          </div>

          <p class="text-sm mb-5" style="color: rgba(var(--v-theme-on-surface), 0.55); line-height: 1.6;">
            {{ $t('gamepad.modSuggestBody') }}
          </p>

          <!-- Mod card -->
          <div
            v-if="suggestedMod"
            class="gp-mod-card mb-5"
          >
            <div class="gp-mod-card__icon">
              <v-icon size="24" color="primary">mdi-puzzle</v-icon>
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-sm font-bold mb-0.5" style="color: rgba(var(--v-theme-on-surface), 0.9)">
                {{ suggestedMod.name }}
              </div>
              <div class="text-xs" style="color: rgba(var(--v-theme-on-surface), 0.5); line-height: 1.5;">
                {{ suggestedMod.description }}
              </div>
              <div class="flex items-center gap-2 mt-2">
                <span class="gp-tag">
                  <v-icon size="11" class="mr-0.5">mdi-cog</v-icon>
                  {{ suggestedMod.loader }}
                </span>
                <span class="gp-tag">
                  <v-icon size="11" class="mr-0.5">mdi-earth</v-icon>
                  Modrinth
                </span>
              </div>
            </div>
          </div>

          <!-- Status alerts -->
          <Transition name="gp-fade">
            <div
              v-if="modInstallError"
              class="gp-status gp-status--error mb-4"
            >
              <v-icon size="16" color="error" class="mr-2 flex-shrink-0">mdi-alert-circle</v-icon>
              <span class="text-xs">{{ modInstallError }}</span>
            </div>
          </Transition>

          <Transition name="gp-fade">
            <div
              v-if="modInstallSuccess"
              class="gp-status gp-status--success mb-4"
            >
              <v-icon size="16" color="success" class="mr-2 flex-shrink-0">mdi-check-circle</v-icon>
              <span class="text-xs">{{ $t('gamepad.modInstalled') }}</span>
            </div>
          </Transition>

          <!-- Actions -->
          <div class="flex gap-3 w-full">
            <v-btn
              class="flex-1 gp-btn gp-btn--secondary"
              variant="flat"
              size="large"
              @click="modSuggestShown = false"
            >
              {{ $t('gamepad.modSkip') }}
            </v-btn>
            <v-btn
              v-if="!modInstallSuccess"
              class="flex-1 gp-btn gp-btn--primary"
              variant="flat"
              size="large"
              :loading="modInstalling"
              @click="installSuggestedMod"
            >
              <v-icon size="16" class="mr-1.5">mdi-download</v-icon>
              {{ $t('gamepad.modInstall') }}
            </v-btn>
            <v-btn
              v-else
              class="flex-1 gp-btn gp-btn--success"
              variant="flat"
              size="large"
              @click="modSuggestShown = false"
            >
              <v-icon size="16" class="mr-1.5">mdi-check</v-icon>
              {{ $t('gamepad.modDone') }}
            </v-btn>
          </div>
        </div>
      </div>
    </v-dialog>

    <!-- Gamepad HUD indicator (bottom-right) -->
    <Transition name="gp-slide-up">
      <div
        v-if="gamepadActive && !dialogShown && !modSuggestShown"
        class="gp-hud"
      >
        <v-icon size="14" class="mr-1.5" style="opacity: 0.6">mdi-gamepad-variant</v-icon>
        <span class="text-[11px] font-medium" style="opacity: 0.5">Gamepad</span>
      </div>
    </Transition>
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

<style scoped>
/* ─── Dialog container ─── */
.gp-dialog {
  position: relative;
  overflow: hidden;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(18, 18, 22, 0.92);
  backdrop-filter: blur(24px) saturate(1.8);
  box-shadow:
    0 24px 80px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(255, 255, 255, 0.04) inset;
}

.gp-dialog__content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 32px 28px 24px;
}

/* Decorative top glow */
.gp-dialog__glow {
  position: absolute;
  top: -60px;
  left: 50%;
  transform: translateX(-50%);
  width: 200px;
  height: 120px;
  border-radius: 50%;
  filter: blur(50px);
  opacity: 0.35;
  pointer-events: none;
}
.gp-dialog__glow--primary {
  background: rgb(var(--v-theme-primary));
}
.gp-dialog__glow--accent {
  background: linear-gradient(135deg, #7c3aed, #06b6d4);
}

/* Icon badge */
.gp-dialog__icon-wrap {
  position: relative;
}
.gp-dialog__icon-badge {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.gp-dialog__icon-badge--primary {
  background: rgba(var(--v-theme-primary), 0.12);
  box-shadow: 0 0 24px rgba(var(--v-theme-primary), 0.15);
}
.gp-dialog__icon-badge--accent {
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.15), rgba(6, 182, 212, 0.15));
  box-shadow: 0 0 24px rgba(124, 58, 237, 0.12);
}

/* Chip (controller type) */
.gp-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 100px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}

/* Buttons */
.gp-btn {
  border-radius: 12px !important;
  text-transform: none !important;
  font-weight: 600 !important;
  letter-spacing: 0 !important;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
}
.gp-btn--primary {
  background: rgba(var(--v-theme-primary), 1) !important;
  color: rgba(var(--v-theme-on-primary), 1) !important;
}
.gp-btn--primary:hover {
  box-shadow: 0 4px 20px rgba(var(--v-theme-primary), 0.35) !important;
  transform: translateY(-1px);
}
.gp-btn--secondary {
  background: rgba(var(--v-theme-on-surface), 0.06) !important;
  color: rgba(var(--v-theme-on-surface), 0.7) !important;
}
.gp-btn--secondary:hover {
  background: rgba(var(--v-theme-on-surface), 0.1) !important;
}
.gp-btn--success {
  background: rgba(var(--v-theme-success), 1) !important;
  color: #fff !important;
}
.gp-btn--success:hover {
  box-shadow: 0 4px 20px rgba(var(--v-theme-success), 0.35) !important;
}

/* Button key indicator (A / B / ✖ / ●) */
.gp-btn__key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  background: rgba(0, 0, 0, 0.25);
  color: rgba(255, 255, 255, 0.85);
}
.gp-btn__key--primary {
  background: rgba(255, 255, 255, 0.2);
}

/* Mod card */
.gp-mod-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  width: 100%;
  padding: 16px;
  border-radius: 14px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  text-align: left;
  transition: all 0.2s ease;
}
.gp-mod-card:hover {
  background: rgba(var(--v-theme-on-surface), 0.06);
  border-color: rgba(var(--v-theme-primary), 0.2);
}

.gp-mod-card__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: rgba(var(--v-theme-primary), 0.1);
}

/* Tags */
.gp-tag {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 600;
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), 0.55);
  letter-spacing: 0.02em;
}

/* Status messages */
.gp-status {
  display: flex;
  align-items: flex-start;
  width: 100%;
  padding: 10px 14px;
  border-radius: 10px;
  text-align: left;
  line-height: 1.5;
}
.gp-status--error {
  background: rgba(var(--v-theme-error), 0.08);
  border: 1px solid rgba(var(--v-theme-error), 0.15);
  color: rgb(var(--v-theme-error));
}
.gp-status--success {
  background: rgba(var(--v-theme-success), 0.08);
  border: 1px solid rgba(var(--v-theme-success), 0.15);
  color: rgb(var(--v-theme-success));
}

/* HUD indicator */
.gp-hud {
  position: fixed;
  bottom: 12px;
  right: 12px;
  z-index: 100;
  display: flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 8px;
  background: rgba(18, 18, 22, 0.7);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  pointer-events: none;
}

/* Transitions */
.gp-fade-enter-active,
.gp-fade-leave-active {
  transition: all 0.25s ease;
}
.gp-fade-enter-from,
.gp-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.gp-slide-up-enter-active,
.gp-slide-up-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.gp-slide-up-enter-from,
.gp-slide-up-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>

<style>
/* Global gamepad active styling — unscoped so it applies globally */
.gamepad-active :focus-visible,
.gamepad-active :focus,
.gamepad-active .v-btn:focus,
.gamepad-active .v-list-item:focus,
.gamepad-active .v-card:focus {
  outline: 2px solid rgba(var(--v-theme-primary), 0.8) !important;
  outline-offset: 2px !important;
  box-shadow: 0 0 0 4px rgba(var(--v-theme-primary), 0.15), 0 0 16px rgba(var(--v-theme-primary), 0.1) !important;
  border-radius: 4px !important;
  transition: outline 0.15s ease, box-shadow 0.15s ease !important;
}
</style>
