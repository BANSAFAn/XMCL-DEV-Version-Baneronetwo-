import { SharedTooltipData, pruneTooltipStack, useSharedTooltipData } from '@/composables/sharedTooltip'
import { Directive, DirectiveBinding, markRaw } from 'vue'

export type VSharedTooltipParam = {
  text?: string
  items?: Array<{ icon: string; text: string }>
  color?: string
  list?: Array<string>
  direction?: 'top' | 'bottom' | 'left' | 'right'
} | string

const { blocked, stack, setValue } = useSharedTooltipData()

interface AttachedListeners {
  onEnter: (e: MouseEvent) => void
  onLeave: (e: MouseEvent) => void
  onClick: (e: MouseEvent) => void
}

const LISTENERS_KEY = Symbol('vSharedTooltip.listeners')
const BINDING_KEY = Symbol('vSharedTooltip.binding')

type AttachedEl = HTMLElement & {
  [LISTENERS_KEY]?: AttachedListeners
  [BINDING_KEY]?: DirectiveBinding<((v?: any) => VSharedTooltipParam) | VSharedTooltipParam | undefined>
}

function removeFromStack(el: HTMLElement) {
  // Drop the entry for `el` AND prune any zombies (detached / GC'd elements).
  // Filtering only by `!== el` previously left entries whose WeakRef target
  // had been garbage-collected (deref() === undefined !== el → kept) on the
  // stack forever, which is what made the tooltip stick.
  const next: SharedTooltipData[] = []
  for (const item of stack.value) {
    const target = item.el?.deref()
    if (!target) continue              // GC'd zombie
    if (target === el) continue        // the one we're explicitly removing
    if (!target.isConnected) continue  // detached zombie
    next.push(item)
  }
  if (next.length !== stack.value.length) {
    stack.value = next
  }
}

function buildData(el: HTMLElement, bindings: DirectiveBinding<any>): SharedTooltipData | undefined {
  const newData: SharedTooltipData = {
    text: '',
    direction: 'top',
    x: 0,
    y: 0,
    color: 'black',
    items: undefined,
    list: undefined,
    el: new WeakRef(el),
  }

  function assign(val: VSharedTooltipParam) {
    if (typeof val === 'string') {
      newData.text = val
    } else {
      newData.text = val.text || ''
      newData.items = val.items
      newData.color = val.color || ''
      newData.list = val.list
      newData.direction = val.direction || 'top'
    }
  }

  const val = bindings.value
  if (typeof val === 'string') {
    newData.text = val
  } else if (typeof val === 'function') {
    assign(val())
  } else if (typeof val === 'object' && val !== null) {
    assign(val)
  } else {
    return undefined
  }

  if (bindings.modifiers.left) {
    newData.direction = 'left'
  } else if (bindings.modifiers.right) {
    newData.direction = 'right'
  } else if (bindings.modifiers.bottom) {
    newData.direction = 'bottom'
  } else if (bindings.modifiers.top) {
    newData.direction = 'top'
  }

  const rect = el.getBoundingClientRect()
  if (newData.direction === 'top') {
    newData.x = rect.x + rect.width / 2
    newData.y = rect.y
  } else if (newData.direction === 'bottom') {
    newData.x = rect.x + rect.width / 2
    newData.y = rect.y + rect.height
  } else if (newData.direction === 'right') {
    newData.x = rect.x + rect.width
    newData.y = rect.y + rect.height / 2
  } else {
    newData.x = rect.x
    newData.y = rect.y + rect.width / 2
  }

  return newData
}

function bind(el: AttachedEl, bindings: DirectiveBinding<any>) {
  el[BINDING_KEY] = bindings

  const onEnter = () => {
    if (blocked.value) return
    const currentBinding = el[BINDING_KEY]
    if (!currentBinding) return
    const data = buildData(el, currentBinding)
    if (!data) return

    // Always remove any prior entry for this same element before re-pushing.
    // Prevents duplicate entries if mouseenter fires twice without a
    // matching mouseleave (can happen with disabled-state CSS toggles).
    removeFromStack(el)
    stack.value = [...stack.value, markRaw(data)]
    setValue(true)
  }
  const onLeave = () => {
    if (blocked.value) return
    removeFromStack(el)
    setValue(stack.value.length > 0)
  }
  const onClick = () => {
    if (blocked.value) return
    removeFromStack(el)
    setValue(stack.value.length > 0)
  }

  el.addEventListener('mouseenter', onEnter)
  el.addEventListener('mouseleave', onLeave)
  el.addEventListener('click', onClick)
  el[LISTENERS_KEY] = { onEnter, onLeave, onClick }
}

function unbind(el: AttachedEl) {
  const listeners = el[LISTENERS_KEY]
  if (listeners) {
    el.removeEventListener('mouseenter', listeners.onEnter)
    el.removeEventListener('mouseleave', listeners.onLeave)
    el.removeEventListener('click', listeners.onClick)
    delete el[LISTENERS_KEY]
  }
  delete el[BINDING_KEY]
  // Crucial: when the host element is unmounted, drop its stack entry and
  // any other zombies, then re-evaluate visibility. Without this the tooltip
  // can stay visible after the hovered element is removed (the original
  // FunctionDirective had no unmount hook at all — that was the leak).
  removeFromStack(el)
  setValue(stack.value.length > 0)
}

export const vSharedTooltip: Directive<HTMLElement, ((v?: any) => VSharedTooltipParam) | VSharedTooltipParam | undefined> = {
  mounted(el, bindings) {
    bind(el as AttachedEl, bindings)
  },
  updated(el, bindings) {
    // Refresh the cached binding so dynamic tooltip content is picked up
    // on the next mouseenter without rewiring listeners.
    ;(el as AttachedEl)[BINDING_KEY] = bindings
  },
  beforeUnmount(el) {
    unbind(el as AttachedEl)
  },
}

// Periodic safety net: sweep zombies every 5s in case some path skips the
// directive lifecycle entirely (rare, but cheap insurance).
if (typeof window !== 'undefined') {
  setInterval(() => {
    if (stack.value.length === 0) return
    pruneTooltipStack()
    if (stack.value.length === 0) setValue(false)
  }, 5000)
}
