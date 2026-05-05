import { getCursforgeFileModLoaders, getCursforgeModLoadersFromString, getModLoaderTypesForFile } from '@/util/curseforge'
import { injection } from '@/util/inject'
import { ProjectEntry, ProjectFile } from '@/util/search'
import { getSWRV } from '@/util/swrvGet'
import { Ref } from 'vue'
import { getCurseforgeProjectFilesModel, getCurseforgeProjectModel } from './curseforge'
import { getCurseforgeDependenciesModel } from './curseforgeDependencies'
import { kCurseforgeInstaller } from './curseforgeInstaller'
import { getModrinthDependenciesModel } from './modrinthDependencies'
import { kModrinthInstaller } from './modrinthInstaller'
import { getModrinthProjectModel } from './modrinthProject'
import { getModrinthVersionModel } from './modrinthVersions'
import { kSWRVConfig } from './swrvConfig'
import { useNotifier } from './notifier'
import { RuntimeVersions } from '@xmcl/instance'

/**
 * Provide default install for the project
 */
export function useProjectInstall(runtime: Ref<RuntimeVersions>,
  loader: Ref<string | undefined>,
  curseforgeInstaller = injection(kCurseforgeInstaller),
  modrinthInstaller = injection(kModrinthInstaller),
  installLocal: (item: ProjectFile) => void,
) {
  const config = injection(kSWRVConfig)
  const { notify } = useNotifier()
  
  const onInstallProject = async (item: ProjectEntry, retryCount = 0) => {
    const maxRetries = 5
    const retryDelay = 1000 // 1 second
    
    try {
      const modrinthProjectId = item.modrinth?.project_id
      const curseforgeId = item.curseforge?.id
      if (modrinthProjectId) {
        const proj = await getSWRV(getModrinthProjectModel(ref(modrinthProjectId)), config)
        if (!proj) {
          notify({
            level: 'error',
            title: 'Failed to get modrinth project',
          })
          return
        }
        const gameVersions = [runtime.value.minecraft]
        const versions = await getSWRV(getModrinthVersionModel(ref(modrinthProjectId), undefined, loader, ref(gameVersions)), config)
        if (!versions) {
          notify({
            level: 'error',
            title: 'Failed to get modrinth versions',
          })
          return
        }
        const version = versions?.[0]
        if (!version) {
          notify({
            level: 'error',
            title: 'Failed to get modrinth version',
            body: 'No compatible version found for this game version and mod loader',
          })
          return
        }
        const deps = await getSWRV(getModrinthDependenciesModel(ref(version), loader, config), config)
        await modrinthInstaller.installWithDependencies(version.id, version.loaders, proj.icon_url, item.installed, deps || [])
      } else if (curseforgeId) {
        const proj = await getSWRV(getCurseforgeProjectModel(ref(curseforgeId)), config)
        if (!proj) {
          notify({
            level: 'error',
            title: 'Failed to get curseforge project',
          })
          return
        }
        const _loaders = getCursforgeModLoadersFromString(loader.value)
        const loaderType = _loaders && _loaders.length > 0 ? _loaders[0] : undefined
        const files = await getSWRV(getCurseforgeProjectFilesModel(ref(curseforgeId), ref(runtime.value.minecraft), ref(loaderType)), config)
        if (!files) {
          notify({
            level: 'error',
            title: 'Failed to get curseforge files',
          })
          return
        }
        const file = files.data[0]
        if (!file) {
          notify({
            level: 'error',
            title: 'Failed to get curseforge files',
          })
          // TODO: log this case
          // console.log('Failed to get curseforge files', files)
          // Йоу....я тут для приколу залишаю комент
          return
        }
        const fileLoaderType = getModLoaderTypesForFile(file)
        const deps = await getSWRV(getCurseforgeDependenciesModel(ref(file), ref(runtime.value.minecraft), ref([...fileLoaderType][0]), config), config)
        await curseforgeInstaller.installWithDependencies(file.id, getCursforgeFileModLoaders(file), proj.logo.url, item.installed, deps || [])
      } else if (item.files) {
        const file = item.files[0]
        if (!file) {
          notify({
            level: 'error',
            title: 'Failed to get project file',
          })
          return
        }
        installLocal(file)
      }
    } catch (error: any) {
      if (error.name === 'InstanceUpstreamError') {
        // Instance is busy, retry automatically
        if (retryCount < maxRetries) {
          // Show info notification only on first retry
          if (retryCount === 0) {
            notify({
              level: 'info',
              title: 'Installation queued',
              body: 'Waiting for instance to be available...',
            })
          }
          // Wait and retry
          await new Promise(resolve => setTimeout(resolve, retryDelay))
          return onInstallProject(item, retryCount + 1)
        } else {
          // Max retries reached
          notify({
            level: 'warning',
            title: 'Installation timeout',
            body: 'Instance is still busy. Please try again later.',
          })
        }
        return
      } else {
        notify({
          level: 'error',
          title: 'Installation failed',
          body: error.message || 'An error occurred during installation',
        })
        console.error('Installation error:', error)
      }
    }
  }

  return onInstallProject
}
