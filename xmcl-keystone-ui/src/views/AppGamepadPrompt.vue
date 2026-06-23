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

    <!-- Gamepad On-Screen Virtual Keyboard -->
    <v-dialog
      v-model="keyboardShown"
      max-width="850"
      persistent
      no-click-animation
      content-class="gamepad-keyboard-dialog"
    >
      <v-card class="gamepad-keyboard-card pa-4">
        <div class="d-flex align-center mb-4">
          <v-icon color="primary" class="mr-2">mdi-keyboard-outline</v-icon>
          <span class="text-h6 font-weight-medium">On-Screen Keyboard</span>
          <v-spacer />
          <v-btn icon="mdi-close" variant="text" size="small" @click="closeKeyboard(false)" />
        </div>
        
        <v-text-field
          v-model="keyboardText"
          readonly
          variant="outlined"
          class="mb-4 text-h5 text-center font-mono"
          :type="isPassword ? 'password' : 'text'"
          hide-details
          focused
        />
        
        <div class="keyboard-grid">
          <div v-for="(row, rIdx) in (isShiftActive ? rowsUpper : rowsLower)" :key="rIdx" class="keyboard-row">
            <v-btn
              v-for="key in row"
              :key="key"
              :color="getKeyColor(key)"
              :class="['keyboard-key', getKeyClass(key)]"
              variant="flat"
              @click="onKeyPress(key)"
            >
              {{ key }}
            </v-btn>
          </div>
        </div>
      </v-card>
    </v-dialog>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue'
import { useNotifier } from '@/composables/notifier'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { notify } = useNotifier()

const dialogShown = ref(false)
const gamepadActive = ref(localStorage.getItem('gamepad_enabled') === 'true')

let animationFrameId: number | null = null
const promptDismissedSession = ref(sessionStorage.getItem('gamepad_prompt_dismissed') === 'true')

// Dynamic gamepad layout / button label detection (SteamDeck/Xbox vs PlayStation)
const gamepadType = ref<'xbox' | 'playstation'>('xbox')
const buttonALabel = computed(() => gamepadType.value === 'playstation' ? '✖' : 'A')
const buttonBLabel = computed(() => gamepadType.value === 'playstation' ? '●' : 'B')

// Virtual Keyboard State
const keyboardShown = ref(false)
const keyboardText = ref('')
const isShiftActive = ref(false)
const activeInput = ref<HTMLInputElement | HTMLTextAreaElement | null>(null)

const isPassword = computed(() => activeInput.value?.type === 'password')

// Keyboard Layouts
const rowsLower = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', 'Backspace'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'Enter'],
  ['Shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '@', '.', '_'],
  ['Space', 'Clear', 'Done']
]

const rowsUpper = [
  ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', 'Backspace'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'Enter'],
  ['Shift', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '<', '>', '?'],
  ['Space', 'Clear', 'Done']
]

function getKeyColor(key: string): string {
  if (key === 'Done') return 'success'
  if (key === 'Backspace' || key === 'Clear') return 'error'
  if (key === 'Shift') return isShiftActive.value ? 'primary' : 'grey-darken-3'
  return 'grey-darken-4'
}

function getKeyClass(key: string): string {
  if (key === 'Space') return 'key-space'
  if (key === 'Done') return 'key-done'
  if (key === 'Shift') return 'key-shift'
  if (key === 'Backspace') return 'key-backspace'
  return ''
}

// Input listener to trigger on-screen keyboard
function handleFocusIn(e: FocusEvent) {
  if (!gamepadActive.value) return
  const target = e.target as HTMLElement
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
    const input = target as HTMLInputElement
    // Avoid triggering on buttons/checkboxes that are natively styled as inputs
    if (['button', 'checkbox', 'radio', 'submit', 'file', 'range'].includes(input.type)) {
      return
    }
    // Prevent infinite loop if focusing virtual keyboard text field
    if (input.closest('.gamepad-keyboard-card')) {
      return
    }
    
    activeInput.value = input
    keyboardText.value = input.value
    isShiftActive.value = false
    keyboardShown.value = true
    
    // Focus the first key of the virtual keyboard on open
    nextTick(() => {
      setTimeout(() => {
        const firstKey = document.querySelector('.gamepad-keyboard-card .keyboard-key') as HTMLElement
        if (firstKey) {
          firstKey.focus()
        }
      }, 100)
    })
  }
}

function onKeyPress(key: string) {
  if (key === 'Backspace') {
    keyboardText.value = keyboardText.value.slice(0, -1)
  } else if (key === 'Clear') {
    keyboardText.value = ''
  } else if (key === 'Space') {
    keyboardText.value += ' '
  } else if (key === 'Shift') {
    isShiftActive.value = !isShiftActive.value
  } else if (key === 'Enter' || key === 'Done') {
    closeKeyboard(true)
  } else {
    keyboardText.value += key
  }
}

function closeKeyboard(apply: boolean) {
  if (apply && activeInput.value) {
    activeInput.value.value = keyboardText.value
    // Dispatch input and change events for reactive frameworks (Vue, Vuetify)
    activeInput.value.dispatchEvent(new Event('input', { bubbles: true }))
    activeInput.value.dispatchEvent(new Event('change', { bubbles: true }))
  }
  
  const oldInput = activeInput.value
  keyboardShown.value = false
  activeInput.value = null
  
  // Return focus to the original input field
  if (oldInput) {
    nextTick(() => {
      oldInput.focus()
    })
  }
}

// Cooldown tracker for repeated inputs
const lastInputTime = ref(0)
const COOLDOWN_MS = 200 // repeat speed
const SCROLL_SPEED = 12 // pixels per frame

// To prevent triggering multiple clicks/escapes per press
const prevButtonsState = ref<boolean[]>([])

// Helper to find all visible, focusable elements
function getFocusableElements(): HTMLElement[] {
  // Query standard elements + Vuetify interactive lists, cards, tabs, and clickable controls
  const selector = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"]), .v-list-item, .v-tab, .v-card, [role="button"], .cursor-pointer, .v-selection-control, .v-switch'
  const elements = Array.from(document.querySelectorAll<HTMLElement>(selector))
  
  return elements.filter(el => {
    // Check if visible and interactive
    const style = window.getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
      return false
    }
    
    // Check bounding rect
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      return false
    }
    
    // Check parents for display: none
    let parent = el.parentElement
    while (parent) {
      const parentStyle = window.getComputedStyle(parent)
      if (parentStyle.display === 'none' || parentStyle.visibility === 'hidden') {
        return false
      }
      parent = parent.parentElement
    }

    // Ensure it can be focused by setting tabIndex if it doesn't have one
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
    // Default to the first focusable element
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

    // Direction constraints
    if (direction === 'up' && dy >= -1) continue
    if (direction === 'down' && dy <= 1) continue
    if (direction === 'left' && dx >= -1) continue
    if (direction === 'right' && dx <= 1) continue

    // Distance metric: prioritize directional alignment
    let score = 0
    if (direction === 'up' || direction === 'down') {
      score = dy * dy + dx * dx * 5 // penalize horizontal offset
    } else {
      score = dx * dx + dy * dy * 5 // penalize vertical offset
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
    // Linear navigation fallback
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
}

// Check if any gamepad is plugged in on mount
function checkInitialGamepads() {
  const gamepads = navigator.getGamepads ? navigator.getGamepads() : []
  for (const gp of gamepads) {
    if (gp) {
      if (gamepadActive.value) {
        break
      }
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
      } else if (keyboardShown.value) {
        const current = document.activeElement as HTMLElement
        if (current && current.closest('.gamepad-keyboard-card')) {
          current.click()
        }
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
      } else if (keyboardShown.value) {
        closeKeyboard(false)
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

onMounted(() => {
  checkInitialGamepads()
  animationFrameId = requestAnimationFrame(pollGamepads)
  window.addEventListener('gamepadconnected', () => {
    promptDismissedSession.value = false
    sessionStorage.removeItem('gamepad_prompt_dismissed')
  })
  window.addEventListener('focusin', handleFocusIn)
})

onUnmounted(() => {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId)
  }
  window.removeEventListener('focusin', handleFocusIn)
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

/* Virtual Keyboard Styling */
.gamepad-keyboard-dialog {
  align-items: flex-end !important;
  margin-bottom: 24px !important;
}

.gamepad-keyboard-card {
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
  background: rgba(25, 25, 25, 0.9) !important;
  backdrop-filter: blur(15px);
  border-radius: 16px !important;
  width: 100%;
}

.keyboard-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.keyboard-row {
  display: flex;
  flex-direction: row;
  gap: 8px;
  justify-content: center;
}

.keyboard-key {
  min-width: 45px !important;
  height: 48px !important;
  text-transform: none !important;
  font-size: 1.1rem !important;
  border-radius: 6px !important;
  padding: 0 8px !important;
}

.key-space {
  min-width: 250px !important;
}

.key-done {
  min-width: 100px !important;
}

.key-shift {
  min-width: 80px !important;
}

.key-backspace {
  min-width: 100px !important;
}
</style>
