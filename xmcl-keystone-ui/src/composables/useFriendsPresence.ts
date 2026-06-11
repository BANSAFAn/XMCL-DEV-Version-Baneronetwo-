import { ref, watch, onScopeDispose, computed } from 'vue'
import { useService } from '@/composables'
import { BaseServiceKey, AUTHORITY_MICROSOFT, LaunchServiceKey } from '@xmcl/runtime-api'
import { kUserContext } from '@/composables/user'
import { kMinecraftFriends } from '@/composables/minecraftFriends'
import { injection } from '@/util/inject'

export interface FriendPresenceInfo {
  profileId: string
  name: string
  avatar: string
  status: 'offline' | 'online' | 'playing'
  instanceName?: string
  version?: string
  serverAddress?: string
  p2pGroupId?: string
  lastActive: number
}

/**
 * Presence system using the existing XMCL group WebSocket relay.
 *
 * Architecture:
 * - Each user joins their OWN presence room: `presence-{myUUID}`
 * - To check if a friend is online, we connect to `presence-{friendUUID}`
 * - We send WHO and they respond with ME containing their game status
 * - Both sides handle WHO/ME so it's bidirectional
 *
 * Important: friend sockets include reconnection logic and periodic
 * WHO polling to detect when friends come online or change status.
 */
export function useFriendsPresence() {
  const { getSessionId } = useService(BaseServiceKey)
  const { userProfile, gameProfile } = injection(kUserContext)
  const { data: friendsData } = injection(kMinecraftFriends)
  const { on: onLaunchEvent } = useService(LaunchServiceKey)

  const clientToken = ref('')
  const onlineFriends = ref<Record<string, FriendPresenceInfo>>({})
  const enabled = ref(true)

  const isPlaying = ref(false)
  const playingInstanceName = ref('')
  const playingVersion = ref('')
  const playingServer = ref('')

  // Listen for game start/exit events from the backend
  onLaunchEvent('minecraft-start', (event: any) => {
    isPlaying.value = true
    // Extract instance name from gameDirectory path
    const gameDir = event.gameDirectory || ''
    playingInstanceName.value = gameDir ? gameDir.split(/[\\/]/).pop() || '' : ''
    playingVersion.value = event.version || event.minecraft || ''
    playingServer.value = event.server ? `${event.server.host}:${event.server.port ?? 25565}` : ''

    // Broadcast updated presence to all connected rooms
    broadcastPresence()
  })

  onLaunchEvent('minecraft-exit', () => {
    isPlaying.value = false
    playingInstanceName.value = ''
    playingVersion.value = ''
    playingServer.value = ''

    broadcastPresence()
  })

  // WebSockets references
  let myPresenceSocket: WebSocket | null = null
  const friendSockets = new Map<string, WebSocket>()
  let heartbeatInterval: any = null
  let whoPollingInterval: any = null

  // Get friends list
  const friendsList = computed(() => friendsData.value?.friends ?? [])

  // Check if active user is Microsoft user
  const isMicrosoftUser = computed(() => userProfile.value?.authority === AUTHORITY_MICROSOFT)

  // Check if active user has a valid Minecraft license (Microsoft account + valid game profile)
  const isLicensed = computed(() => isMicrosoftUser.value && !!gameProfile.value?.id && gameProfile.value.id !== '')

  // Initialize client token
  getSessionId().then((id) => {
    clientToken.value = id
  })

  // Build the presence profile containing current game activity
  function getMyPresenceProfile() {
    const profile = gameProfile.value
    if (!profile) return null

    // Check if we are hosting P2P
    const p2pGroupId = localStorage.getItem('peerGroup') || undefined

    return {
      id: profile.id,
      name: profile.name,
      textures: profile.textures,
      avatar: profile.textures?.SKIN?.url ?? '',
      status: isPlaying.value ? 'playing' as const : 'online' as const,
      instanceName: playingInstanceName.value || undefined,
      version: playingVersion.value || undefined,
      serverAddress: playingServer.value || undefined,
      p2pGroupId: p2pGroupId && p2pGroupId.length > 0 ? p2pGroupId : undefined,
    }
  }

  // Broadcast ME to all active sockets (my own room + friend rooms)
  function broadcastPresence() {
    const profile = getMyPresenceProfile()
    if (!profile) return

    const msg = JSON.stringify({
      type: 'ME',
      sender: clientToken.value,
      profile,
    })

    // Broadcast to my own presence room
    if (myPresenceSocket && myPresenceSocket.readyState === WebSocket.OPEN) {
      myPresenceSocket.send(msg)
    }
  }

  // Setup presence server socket for ourselves
  function setupMyPresenceSocket() {
    if (myPresenceSocket) {
      myPresenceSocket.close()
      myPresenceSocket = null
    }

    const myUUID = gameProfile.value?.id
    if (!myUUID || !clientToken.value || !enabled.value || !isMicrosoftUser.value) return

    const url = `wss://api.xmcl.app/group/presence-${myUUID}?client=${clientToken.value}`

    try {
      const ws = new WebSocket(url)
      myPresenceSocket = ws

      ws.onopen = () => {
        console.log('[Presence] My presence room connected')
        // Broadcast our presence immediately on connect
        broadcastPresence()
      }

      ws.onmessage = (event) => {
        const { data } = event
        // Skip binary heartbeat messages
        if (typeof data !== 'string') return

        try {
          const payload = JSON.parse(data)
          if (payload.type === 'WHO' && payload.sender) {
            // Check if the sender is a friend
            const senderProfile = payload.profile
            if (!senderProfile || !senderProfile.id) {
              console.warn('[Presence] WHO request rejected: missing profile')
              return
            }

            const normalizedSenderId = senderProfile.id.replace(/-/g, '').toLowerCase()
            const isFriend = friendsList.value.some(f => f.profileId.replace(/-/g, '').toLowerCase() === normalizedSenderId)
            
            if (!isFriend) {
              console.warn('[Presence] WHO request rejected: sender is not in friends list:', senderProfile.id)
              return
            }

            // A friend is asking who we are. Send our presence profile
            const profile = getMyPresenceProfile()
            if (!profile) return
            ws.send(JSON.stringify({
              type: 'ME',
              receiver: payload.sender,
              sender: clientToken.value,
              profile,
            }))
          }
          // We can also receive ME messages if someone broadcasts in our room
        } catch (e) {
          // Ignore malformed messages
        }
      }

      ws.onerror = () => {
        console.warn('[Presence] My presence socket error, will reconnect')
      }

      ws.onclose = () => {
        console.log('[Presence] My presence socket closed')
        // Auto-reconnect after delay if not intentionally closed
        if (enabled.value && isMicrosoftUser.value) {
          setTimeout(() => {
            if (myPresenceSocket === ws) {
              setupMyPresenceSocket()
            }
          }, 5000)
        }
      }
    } catch (e) {
      console.error('[Presence] Failed to create my presence socket', e)
    }
  }

  // Create a monitored WebSocket for a single friend's presence room
  function createFriendSocket(friendId: string) {
    // Clean up existing socket for this friend
    const existing = friendSockets.get(friendId)
    if (existing) {
      existing.close()
      friendSockets.delete(friendId)
    }

    if (!clientToken.value || !enabled.value || !isMicrosoftUser.value) return

    const url = `wss://api.xmcl.app/group/presence-${friendId}?client=${clientToken.value}`

    try {
      const ws = new WebSocket(url)
      friendSockets.set(friendId, ws)

      ws.onopen = () => {
        // Send WHO to ask for their identity/presence, including our own profile for verification
        const myProfile = gameProfile.value
        ws.send(JSON.stringify({
          type: 'WHO',
          sender: clientToken.value,
          profile: myProfile ? {
            id: myProfile.id,
            name: myProfile.name,
          } : undefined,
        }))
      }

      ws.onmessage = (event) => {
        const { data } = event
        // Skip binary heartbeat messages (they indicate someone is in the room)
        if (typeof data !== 'string') {
          // Binary data = heartbeat from the friend, they're alive
          // Update lastActive for liveness tracking
          const existing = onlineFriends.value[friendId]
          if (existing) {
            existing.lastActive = Date.now()
          }
          return
        }

        try {
          const payload = JSON.parse(data)
          if (payload.type === 'WHO') {
            // The friend is asking who we are in their room — respond with our profile
            const profile = getMyPresenceProfile()
            if (!profile) return
            ws.send(JSON.stringify({
              type: 'ME',
              sender: clientToken.value,
              profile,
            }))
          } else if (payload.type === 'ME' && payload.profile) {
            // Verify that the profile ID matches the friend we connected to
            const normalizedProfileId = (payload.profile.id || '').replace(/-/g, '').toLowerCase()
            const normalizedFriendId = friendId.replace(/-/g, '').toLowerCase()
            if (normalizedProfileId === normalizedFriendId) {
              onlineFriends.value = {
                ...onlineFriends.value,
                [friendId]: {
                  profileId: friendId,
                  name: payload.profile.name,
                  avatar: payload.profile.avatar,
                  status: payload.profile.status || 'online',
                  instanceName: payload.profile.instanceName,
                  version: payload.profile.version,
                  serverAddress: payload.profile.serverAddress,
                  p2pGroupId: payload.profile.p2pGroupId,
                  lastActive: Date.now(),
                },
              }
            }
          }
        } catch (e) {
          // Ignore malformed messages
        }
      }

      ws.onerror = () => {
        // Will trigger onclose
      }

      ws.onclose = () => {
        // Auto-reconnect if the friend is still in our list
        const stillFriend = friendsList.value.some((f) => f.profileId === friendId)
        if (stillFriend && enabled.value && isMicrosoftUser.value) {
          setTimeout(() => {
            if (friendSockets.get(friendId) === ws) {
              createFriendSocket(friendId)
            }
          }, 8000) // Reconnect with longer backoff to avoid hammering
        }
      }
    } catch (e) {
      console.error(`[Presence] Failed to create socket for friend ${friendId}`, e)
    }
  }

  // Setup friend monitor sockets
  function updateFriendSockets() {
    if (!clientToken.value || !enabled.value || !isMicrosoftUser.value) {
      clearAllSockets()
      return
    }

    const currentFriends = friendsList.value
    const currentFriendIds = new Set(currentFriends.map((f) => f.profileId))

    // Close sockets for removed friends
    for (const [friendId, ws] of friendSockets.entries()) {
      if (!currentFriendIds.has(friendId)) {
        ws.close()
        friendSockets.delete(friendId)
        const updated = { ...onlineFriends.value }
        delete updated[friendId]
        onlineFriends.value = updated
      }
    }

    // Open sockets for new friends (only if not already connected)
    for (const friend of currentFriends) {
      const friendId = friend.profileId
      if (!friendSockets.has(friendId)) {
        createFriendSocket(friendId)
      }
    }
  }

  function clearAllSockets() {
    if (myPresenceSocket) {
      myPresenceSocket.close()
      myPresenceSocket = null
    }
    for (const ws of friendSockets.values()) {
      ws.close()
    }
    friendSockets.clear()
    onlineFriends.value = {}
  }

  // Periodic WHO polling — ask friends for their presence status every 10s
  // This handles cases where the friend connects after we do
  whoPollingInterval = setInterval(() => {
    const myProfile = gameProfile.value
    for (const [friendId, ws] of friendSockets.entries()) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'WHO',
          sender: clientToken.value,
          profile: myProfile ? {
            id: myProfile.id,
            name: myProfile.name,
          } : undefined,
        }))
      }
    }
  }, 10_000)

  // Periodic offline cleanup — remove friends who haven't been seen in 30s
  heartbeatInterval = setInterval(() => {
    const now = Date.now()
    let changed = false
    const updated = { ...onlineFriends.value }
    for (const [friendId, info] of Object.entries(updated)) {
      if (now - info.lastActive > 30_000) {
        delete updated[friendId]
        changed = true
      }
    }
    if (changed) {
      onlineFriends.value = updated
    }
  }, 5_000)

  // Watchers to trigger setup
  watch([clientToken, enabled, isMicrosoftUser, () => gameProfile.value?.id], () => {
    setupMyPresenceSocket()
    updateFriendSockets()
  })

  watch(friendsList, () => {
    updateFriendSockets()
  })

  // Cleanup on destroy
  onScopeDispose(() => {
    clearInterval(heartbeatInterval)
    clearInterval(whoPollingInterval)
    clearAllSockets()
  })

  return {
    onlineFriends,
    enabled,
    friendsList,
    isMicrosoftUser,
    isLicensed,
  }
}
