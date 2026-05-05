import { isNotNull } from '@xmcl/core/utils'
import {
  File as CurseforgeFile,
  CurseforgeV1Client,
  HashAlgo,
  guessCurseforgeFileUrl,
} from '@xmcl/curseforge'
import { DownloadBaseOptions, download } from '@xmcl/file-transfer'
import { diagnoseFile, onDownloadSingle, Tracker } from '@xmcl/installer'
import { InstanceFile as _InstanceFile } from '@xmcl/instance'
import { ModrinthV2Client, ProjectVersion } from '@xmcl/modrinth'
import { File } from '@xmcl/resource'
import {
  InstallCurseforgeFileTask,
  InstallCurseforgeFileTrackerEvents,
  InstallModrinthFileTask,
  InstallModrinthFileTrackerEvents,
  getCurseforgeFileUri,
  getModrinthPrimaryFile,
  getModrinthVersionFileUri,
} from '@xmcl/runtime-api'
import { basename, dirname, join } from 'path'
import { LauncherAppPlugin } from '~/app'
import { kTasks } from '~/infra'
import { InstanceInstallService } from '~/instanceIO'
import { kDownloadOptions } from '~/network'
import { kResourceManager, kResourceWorker } from '~/resource'
import { hardLinkFiles } from '~/util/fs'
import { getTracker } from '~/util/taskHelper'
import {
  InstallMarketDirectoryOptions,
  InstallMarketInstanceOptions,
  InstallResult,
  kMarketProvider,
} from './marketProvider'

type InstanceFile = _InstanceFile & { downloads: string[]; icon?: string }

export const pluginMarketProvider: LauncherAppPlugin = async (app) => {
  const logger = app.getLogger('MarketProvider')
  const modrinth = new ModrinthV2Client({ fetch: ((...args) => app.fetch(...args)) as typeof fetch })
  app.registry.register(ModrinthV2Client, modrinth)
  const curseforge = new CurseforgeV1Client(process.env.CURSEFORGE_API_KEY || '', {
    fetch: ((...args) => app.fetch(...args)) as typeof fetch,
  })
  app.registry.register(CurseforgeV1Client, curseforge)

  const installService = await app.registry.get(InstanceInstallService)

  const resourceManager = await app.registry.get(kResourceManager)
  const tasks = await app.registry.get(kTasks)
  const hashWorker = await app.registry.get(kResourceWorker)

  async function getSnapshotByUris(file: InstanceFile, preferDir: string) {
    const sha1 = file.hashes.sha1
      ? file.hashes.sha1
      : await resourceManager.getHashByUri(
          file.downloads[0] ??
            (file.curseforge
              ? getCurseforgeFileUri({
                  modId: file.curseforge.projectId,
                  id: file.curseforge.fileId,
                })
              : getModrinthVersionFileUri({
                  project_id: file.modrinth!.projectId,
                  id: file.modrinth!.versionId,
                  filename: basename(file.path),
                })),
        )

    if (sha1) {
      const snapshots = await resourceManager.getSnapshotsByHash([sha1])
      const all = await Promise.all(
        snapshots.map(async (snapshot) => {
          const cachedFile = await resourceManager.validateSnapshotFile(snapshot)
          if (!cachedFile) {
            return undefined
          }
          if ((await hashWorker.hash(cachedFile.path, cachedFile.size)) !== sha1) {
            return undefined
          }
          return [cachedFile, snapshot] as const
        }),
      )

      const existed = all.filter(isNotNull)

      const matched = existed.find(([file]) => dirname(file.path) === preferDir) || existed[0]

      if (!matched) {
        return undefined
      }

      const metadata = await resourceManager.getMetadataByHash(sha1)
      return [...matched, metadata || {}] as const
    }

    return undefined
  }

  async function ensureTheFile(destination: string, file: File) {
    if (file.path === destination) {
      return
    }
    if (dirname(file.path) === destination) {
      return
    }
    // try to link the file
    file.path = await hardLinkFiles(file.path, destination)
  }

  async function downloadFile(
    instFile: InstanceFile,
    domainDir: string,
    downloadOptions: DownloadBaseOptions,
  ) {
    logger.log(`Starting download for file: ${instFile.path}`)
    logger.log(`Download URLs: ${JSON.stringify(instFile.downloads)}`)
    
    const snapshoted = await getSnapshotByUris(instFile, domainDir)
    const filePath = join(domainDir, instFile.path)
    const uris = instFile.downloads

    if (snapshoted) {
      const [file, snapshot, metadata] = snapshoted
      await ensureTheFile(filePath, file)

      return {
        file,
        snapshot,
        uris,
        path: file.path,
        metadata: {
          ...metadata,
          modrinth: instFile.modrinth,
          curseforge: instFile.curseforge,
        },
      }
    }

    const expectedHash = instFile.hashes.sha1 || instFile.hashes.md5
    const algorithm = instFile.hashes.sha1 ? 'sha1' : instFile.hashes.md5 ? 'md5' : undefined

    // Check if file already exists and is valid
    if (expectedHash && algorithm) {
      const issue = await diagnoseFile(
        {
          file: filePath,
          expectedChecksum: expectedHash,
          algorithm,
          role: 'marketFile',
          hint: `Market file ${basename(instFile.path)}`,
        },
        { checksum: (file, algo) => hashWorker.checksum(file, algo) },
      )
      if (!issue) {
        // File exists and is valid, no need to download
        return {
          uris,
          path: filePath,
          metadata: {
            modrinth: instFile.modrinth,
            curseforge: instFile.curseforge,
          },
        }
      }
    }

    if (instFile.modrinth) {
      if (!instFile.downloads || instFile.downloads.length === 0) {
        logger.error(new Error(`No download URLs available for Modrinth file: ${instFile.path}`))
        throw new Error(`No download URLs available for Modrinth file: ${instFile.path} (project: ${instFile.modrinth.projectId}, version: ${instFile.modrinth.versionId})`)
      }

      logger.log(`Creating Modrinth download task for ${instFile.path}`)
      logger.log(`URLs: ${instFile.downloads.join(', ')}`)
      logger.log(`Destination: ${filePath}`)

      const task = tasks.create<InstallModrinthFileTask>({
        type: 'installModrinthFile',
        key: `installModrinthFile-${instFile.modrinth.projectId}-${instFile.modrinth.versionId}`,
        projectId: instFile.modrinth.projectId,
        versionId: instFile.modrinth.versionId,
        filename: basename(instFile.path),
      })

      const tracker = getTracker<InstallModrinthFileTrackerEvents>(task)

      try {
        logger.log(`Starting download from Modrinth: ${instFile.downloads[0]}`)
        await download({
          url: instFile.downloads,
          destination: filePath,
          pendingFile: filePath + '.pending',
          tracker: onDownloadSingle(tracker, 'download', {}),
          ...downloadOptions,
        })
        logger.log(`Download completed successfully: ${instFile.path}`)
        task.complete()
      } catch (error) {
        logger.error(error as Error, `Download failed for ${instFile.path}`)
        task.fail(error)
        throw error
      }
    } else {
      if (!instFile.downloads || instFile.downloads.length === 0) {
        logger.error(new Error(`No download URLs available for CurseForge file: ${instFile.path}`))
        throw new Error(`No download URLs available for CurseForge file: ${instFile.path} (project: ${instFile.curseforge!.projectId}, file: ${instFile.curseforge!.fileId})`)
      }

      logger.log(`Creating CurseForge download task for ${instFile.path}`)
      logger.log(`URLs: ${instFile.downloads.join(', ')}`)
      logger.log(`Destination: ${filePath}`)

      const task = tasks.create<InstallCurseforgeFileTask>({
        type: 'installCurseforgeFile',
        key: `installCurseforgeFile-${instFile.curseforge!.projectId}-${instFile.curseforge!.fileId}`,
        projectId: instFile.curseforge!.projectId,
        fileId: instFile.curseforge!.fileId,
      })

      const tracker: Tracker<InstallCurseforgeFileTrackerEvents> = getTracker(task)

      try {
        logger.log(`Starting download from CurseForge: ${instFile.downloads[0]}`)
        await download({
          url: instFile.downloads,
          destination: filePath,
          pendingFile: filePath + '.pending',
          tracker: onDownloadSingle(tracker, 'download', {}),
          ...downloadOptions,
        })
        logger.log(`Download completed successfully: ${instFile.path}`)
        task.complete()
      } catch (error) {
        logger.error(error as Error, `Download failed for ${instFile.path}`)
        task.fail(error)
        throw error
      }
    }

    return {
      uris,
      path: filePath,
      metadata: {
        modrinth: instFile.modrinth,
        curseforge: instFile.curseforge,
      },
    }
  }

  async function postprocess(result: InstallResult, directory: string, icon: string | undefined) {
    const watched = resourceManager.getWatched(directory)
    if (watched) {
      watched.enqueue({
        filePath: result.path,
        metadata: result.metadata,
        uris: result.uris,
        icons: icon ? [icon] : undefined,
      })
    } else {
      const snapshot = await resourceManager.getSnapshot(result.path)
      if (snapshot) {
        await resourceManager.updateMetadata([
          {
            hash: snapshot.sha1,
            metadata: result.metadata,
            uris: result.uris,
            icons: icon ? [icon] : undefined,
          },
        ])
      }
    }
  }

  function getModrinthFile(
    domain: string,
    version: ProjectVersion,
    filename?: string,
    icon?: string,
  ): InstanceFile {
    const file = version.files.find((f) => f.filename === filename)
    const modrinthFile = file || getModrinthPrimaryFile(version)
    const filePath = [domain, modrinthFile.filename].filter((v) => !!v).join('/')

    const uris = [modrinthFile.url] as string[]

    return {
      path: filePath,
      hashes: modrinthFile.hashes,
      downloads: uris,
      size: modrinthFile.size,
      modrinth: {
        projectId: version.project_id,
        versionId: version.id,
      },
      icon,
    }
  }

  function getCurseforgeFile(
    domain: string,
    curseforgeFile: CurseforgeFile,
    icon?: string,
  ): InstanceFile {
    const filePath = [domain, curseforgeFile.fileName].filter((v) => !!v).join('/')

    const uris = [] as string[]

    const downloadUrls = [] as string[]
    if (curseforgeFile.downloadUrl) {
      downloadUrls.push(curseforgeFile.downloadUrl)
    } else {
      // Guess the download url if the file url is not provided by curseforge
      downloadUrls.push(...guessCurseforgeFileUrl(curseforgeFile.id, curseforgeFile.fileName))
    }

    uris.push(...downloadUrls)

    const hashes: Record<string, string> = {}
    for (const hash of curseforgeFile.hashes) {
      if (hash.algo === HashAlgo.Sha1) {
        hashes.sha1 = hash.value
      } else if (hash.algo === HashAlgo.Md5) {
        hashes.md5 = hash.value
      }
    }

    return {
      path: filePath,
      hashes,
      downloads: uris,
      size: curseforgeFile.fileLength,
      curseforge: {
        projectId: curseforgeFile.modId,
        fileId: curseforgeFile.id,
      },
      icon,
    }
  }

  async function getFiles(
    options: InstallMarketDirectoryOptions | InstallMarketInstanceOptions,
  ): Promise<InstanceFile[]> {
    const domain = 'domain' in options ? options.domain : ''
    if (options.market === 0) {
      const versions = Array.isArray(options.version) ? options.version : [options.version]
      const versionsDict = Object.fromEntries(versions.map((v) => [v.versionId, v]))
      
      try {
        logger.log(`Fetching Modrinth versions: ${versions.map((v) => v.versionId).join(', ')}`)
        const modrinthVersions = await modrinth.getProjectVersionsById(
          versions.map((v) => v.versionId),
        )

        if (!modrinthVersions || modrinthVersions.length === 0) {
          logger.error(new Error(`No versions returned from Modrinth API`))
          throw new Error(`No versions returned from Modrinth API for version IDs: ${versions.map((v) => v.versionId).join(', ')}`)
        }

        logger.log(`Received ${modrinthVersions.length} versions from Modrinth`)
        const result = modrinthVersions.map((version) => {
          if (!version.files || version.files.length === 0) {
            logger.error(new Error(`Modrinth version ${version.id} has no files`))
            throw new Error(`Modrinth version ${version.id} (project: ${version.project_id}) has no files available`)
          }
          logger.log(`Processing Modrinth version ${version.id} with ${version.files.length} files`)
          return getModrinthFile(
            domain,
            version,
            versionsDict[version.id].filename,
            versionsDict[version.id].icon,
          )
        })
        logger.log(`Successfully prepared ${result.length} Modrinth files for download`)
        return result
      } catch (error) {
        logger.error(error as Error, `Failed to get Modrinth files`)
        throw new Error(`Failed to get Modrinth files: ${error instanceof Error ? error.message : String(error)}`)
      }
    } else {
      const curseforgeFiles = Array.isArray(options.file) ? options.file : [options.file]
      
      try {
        logger.log(`Fetching CurseForge files: ${curseforgeFiles.map((f) => f.fileId).join(', ')}`)
        const files = await curseforge.getFiles(curseforgeFiles.map((f) => f.fileId))

        if (!files || files.length === 0) {
          logger.error(new Error(`No files returned from CurseForge API`))
          throw new Error(`No files returned from CurseForge API for file IDs: ${curseforgeFiles.map((f) => f.fileId).join(', ')}`)
        }

        logger.log(`Received ${files.length} files from CurseForge`)
        const fileDict = Object.fromEntries(curseforgeFiles.map((f) => [f.fileId, f]))
        const result = files.map((file) => getCurseforgeFile(domain, file, fileDict[file.id].icon))
        logger.log(`Successfully prepared ${result.length} CurseForge files for download`)
        return result
      } catch (error) {
        logger.error(error as Error, `Failed to get CurseForge files`)
        throw new Error(`Failed to get CurseForge files: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }

  app.registry.register(kMarketProvider, {
    installFile: async (options) => {
      logger.log(`installFile called for market ${options.market}`)
      const downloadOptions = await app.registry.get(kDownloadOptions)

      const files = await getFiles(options)
      logger.log(`Got ${files.length} files to download`)

      const result = await Promise.all(
        files.map(async (file) => {
          logger.log(`Processing file: ${file.path}`)
          const result = await downloadFile(file, options.directory, downloadOptions)
          await postprocess(result, options.directory, file.icon)
          return result
        }),
      )
      logger.log(`All ${result.length} files processed successfully`)
      return result
    },
    installInstanceFile: async (options: InstallMarketInstanceOptions) => {
      logger.log(`installInstanceFile called for instance ${options.instancePath}`)
      const files = await getFiles(options)
      logger.log(`Got ${files.length} files to install`)

      await installService.installInstanceFiles({
        path: options.instancePath,
        files: files,
        oldFiles: [],
      })

      const result: InstallResult[] = files.map((file) => ({
        path: join(options.instancePath, file.path),
        uris: file.downloads,
        metadata: {
          modrinth: file.modrinth,
          curseforge: file.curseforge,
        },
      }))

      logger.log(`Instance files installed successfully`)
      return result
    },
  })
}
