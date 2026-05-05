<template>
  <div class="absolute z-0 h-full w-full">
    <transition
      name="fade-transition"
    >
      <Particles
        v-if="backgroundType === BackgroundType.PARTICLE"
        color="#dedede"
        class="absolute z-0 h-full w-full"
        :style="{ filter: `blur(${blur}px)` }"
        :click-mode="particleMode"
      />
      <Halo
        v-else-if="backgroundType === BackgroundType.HALO"
        class="absolute z-0 h-full w-full"
        :style="{ filter: `blur(${blur}px)` }"
      />
      <img
        v-else-if="backgroundImage?.type === 'image' && backgroundType === BackgroundType.IMAGE"
        :key="backgroundImage.url"
        :src="backgroundImage.url"
        class="absolute z-0 h-full w-full"
        :style="{ filter: `blur(${blur}px)`, 'object-fit': backgroundImageFit }"
      >
      <video
        v-else-if="backgroundImage?.type === 'video' && backgroundType === BackgroundType.VIDEO"
        ref="videoRef"
        :key="`video-${backgroundImage.url}`"
        class="absolute z-0 h-full w-full object-cover"
        :style="{ filter: `blur(${blur}px)`, 'object-fit': backgroundImageFit }"
        :src="backgroundImage.url"
        autoplay
        loop
      />
      <transition name="screenshot-fade">
        <img
          v-if="backgroundType === BackgroundType.SCREENSHOT && currentScreenshot"
          :key="currentScreenshot"
          :src="currentScreenshot"
          class="absolute z-0 h-full w-full"
          :style="{ filter: `blur(${blur}px)`, 'object-fit': backgroundImageFit }"
        >
        <div
          v-else-if="backgroundType === BackgroundType.SCREENSHOT && !currentScreenshot"
          class="absolute z-0 h-full w-full bg-black"
        />
      </transition>
    </transition>

    <transition
      name="fade-transition"
    >
      <div
        v-if="(backgroundColorOverlay && !isHome) || backgroundType === BackgroundType.NONE"
        class="z-3 absolute h-full w-full"
        :style="{ 'background': backgroundColor }"
      />
    </transition>
  </div>
</template>
<script lang="ts" setup>
import Halo from '@/components/Halo.vue'
import Particles from '@/components/Particles.vue'
import { injection } from '@/util/inject'
import { kTheme, BackgroundType } from '@/composables/theme'
import { kInstanceLaunch } from '@/composables/instanceLaunch'
import { useService } from '@/composables/service'
import { InstanceScreenshotServiceKey } from '@xmcl/runtime-api'
import { kInstance } from '@/composables/instance'

const { sideBarColor, backgroundColorOverlay, backgroundColor, blur, backgroundImage, backgroundType, particleMode, backgroundImageFit, volume, screenshotInterval } = injection(kTheme)
const { path: instancePath } = injection(kInstance)
const { getScreenshots } = useService(InstanceScreenshotServiceKey)

const videoRef = ref(null as null | HTMLVideoElement)
const screenshots = ref<string[]>([])
const currentScreenshotIndex = ref(0)
const currentScreenshot = computed(() => screenshots.value[currentScreenshotIndex.value] || null)

const route = useRoute()
const isHome = computed(() => route.path === '/')

// Load screenshots when background type is SCREENSHOT
watch([backgroundType, instancePath], async ([type, path]) => {
  if (type === BackgroundType.SCREENSHOT && path) {
    try {
      const result = await getScreenshots(path)
      screenshots.value = result
      currentScreenshotIndex.value = 0
    } catch (error) {
      console.error('Failed to load screenshots:', error)
      screenshots.value = []
    }
  }
}, { immediate: true })

// Setup screenshot slideshow interval
let screenshotIntervalId: number | null = null

watch([backgroundType, () => screenshotInterval.value, () => screenshots.value.length], ([type, interval, count]) => {
  // Clear existing interval
  if (screenshotIntervalId !== null) {
    clearInterval(screenshotIntervalId)
    screenshotIntervalId = null
  }

  // Setup new interval if background type is SCREENSHOT and we have screenshots
  if (type === BackgroundType.SCREENSHOT && count > 1) {
    screenshotIntervalId = window.setInterval(() => {
      currentScreenshotIndex.value = (currentScreenshotIndex.value + 1) % screenshots.value.length
    }, (interval ?? 5) * 1000)
  }
}, { immediate: true })

// Cleanup interval on unmount
onUnmounted(() => {
  if (screenshotIntervalId !== null) {
    clearInterval(screenshotIntervalId)
  }
})

watch(volume, (newVolume) => {
  if (videoRef.value) {
    videoRef.value.volume = newVolume
  }
})

const { gameProcesses } = injection(kInstanceLaunch)

watch(computed(() => gameProcesses.value.length), (cur, last) => {
  if (cur > 0 && last === 0) {
    videoRef.value?.pause()
  } else if (cur === 0 && last > 0) {
    videoRef.value?.play()
  }
})

watch(videoRef, (v) => {
  if (v) {
    v.volume = volume.value
  }
})

onMounted(() => {
  if (videoRef.value) {
    videoRef.value.volume = volume.value
  }
})

watch(backgroundType, (t) => {
  console.log(t)
  console.log(backgroundImage.value)
})

</script>
<style scoped>
.img-container {
  background: radial-gradient(ellipse at top right, transparent, v-bind(sideBarColor) 72%);
  position: absolute;
  min-width: 100%;
  min-height: 100%;
  z-index: 4;
}

/* Fade transition */
.screenshot-fade-enter-active,
.screenshot-fade-leave-active {
  transition: opacity 0.8s ease;
}

.screenshot-fade-enter-from,
.screenshot-fade-leave-to {
  opacity: 0;
}

/* Slide transition */
.screenshot-slide-enter-active {
  transition: transform 0.8s ease, opacity 0.8s ease;
  position: absolute;
}

.screenshot-slide-leave-active {
  transition: transform 0.8s ease, opacity 0.8s ease;
  position: absolute;
}

.screenshot-slide-enter-from {
  transform: translateX(100%);
  opacity: 0;
}

.screenshot-slide-enter-to {
  transform: translateX(0);
  opacity: 1;
}

.screenshot-slide-leave-from {
  transform: translateX(0);
  opacity: 1;
}

.screenshot-slide-leave-to {
  transform: translateX(-100%);
  opacity: 0;
}

/* Zoom transition */
.screenshot-zoom-enter-active {
  transition: transform 0.8s ease, opacity 0.8s ease;
  position: absolute;
}

.screenshot-zoom-leave-active {
  transition: transform 0.8s ease, opacity 0.8s ease;
  position: absolute;
}

.screenshot-zoom-enter-from {
  transform: scale(1.2);
  opacity: 0;
}

.screenshot-zoom-enter-to {
  transform: scale(1);
  opacity: 1;
}

.screenshot-zoom-leave-from {
  transform: scale(1);
  opacity: 1;
}

.screenshot-zoom-leave-to {
  transform: scale(0.8);
  opacity: 0;
}
</style>
