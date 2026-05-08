import { ObjectDirective } from 'vue'
import { ContextMenuItem, useContextMenu } from '../composables/contextMenu'

type Binding = undefined | (ContextMenuItem[]) | (() => ContextMenuItem[])

const handlers = new WeakMap<HTMLElement, (e: MouseEvent) => void>()

export const vContextMenu: ObjectDirective<HTMLElement, Binding> = {
  mounted(el, bindings) {
    const { open } = useContextMenu()
    const handler = (e: MouseEvent) => {
      const value = bindings.value
      if (value instanceof Array && value.length > 0) {
        open(e.clientX, e.clientY, value)
        e.preventDefault()
        e.stopPropagation()
      } else if (typeof value === 'function') {
        open(e.clientX, e.clientY, value())
        e.preventDefault()
        e.stopPropagation()
      }
    }
    handlers.set(el, handler)
    el.addEventListener('contextmenu', handler)
  },
  beforeUnmount(el) {
    const handler = handlers.get(el)
    if (handler) {
      el.removeEventListener('contextmenu', handler)
      handlers.delete(el)
    }
  },
}
