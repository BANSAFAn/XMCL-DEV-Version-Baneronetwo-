import { i18n } from '@/i18n'
import { vuetify } from '@/vuetify'
import { usePreferredDark } from '@vueuse/core'
import 'virtual:uno.css'
import { createApp, defineComponent, h } from 'vue'
import App from './App.vue'

const app = createApp(defineComponent({
  setup(props, context) {
    const preferDark = usePreferredDark()
    const updateTheme = (theme: string) => {
      if (theme === 'system') {
        vuetify.theme.global.name.value = preferDark.value ? 'dark' : 'light'
      } else if (theme === 'dark') {
        vuetify.theme.global.name.value = 'dark'
      } else if (theme === 'light') {
        vuetify.theme.global.name.value = 'light'
      }
    }
    updateTheme('dark')

    return () => h(App)
  },
}))

app.use(i18n)
app.use(vuetify)

app.mount('#app')

