import { InjectionKey, Ref } from 'vue'
import { useLocalStorageCache } from './cache'

export const kInstanceDefaultSource: InjectionKey<Ref<'curseforge' | 'modrinth'>> = Symbol('InstanceDefaultSource')

export function useInstanceDefaultSource(path: Ref<string>): Ref<'curseforge' | 'modrinth'> {
  const defaultSource = useLocalStorageCache(computed(() => `instanceDefaultSource?instance=${path.value}`), () => 'modrinth', s => s, s => (s === 'curseforge' || s === 'modrinth' ? s : 'modrinth'))
  return defaultSource as Ref<'curseforge' | 'modrinth'>
}
