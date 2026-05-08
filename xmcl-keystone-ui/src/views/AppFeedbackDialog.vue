<template>
  <v-dialog
    v-model="isShown"
    hide-overlay
    transition="dialog-bottom-transition"
    width="600"
    scrollable
  >
    <v-card class="flex max-h-[85vh] flex-col overflow-hidden">
      <v-toolbar
        color="primary"
        flat
      >
        <v-toolbar-title class="flex items-center">
          <v-icon class="mr-2">feedback</v-icon>
          {{ t('feedback.name') }}
        </v-toolbar-title>
        <v-spacer />
        <v-btn
          icon
          @click="hide"
        >
          <v-icon>close</v-icon>
        </v-btn>
      </v-toolbar>

      <v-card-text class="flex flex-col gap-4 overflow-x-hidden overflow-y-auto p-4">
        <v-card flat class="p-4">
          <div class="mb-2 flex items-center">
            <v-icon color="primary" class="mr-2">info</v-icon>
            <span class="text-h6">{{ t('feedback.description') }}</span>
          </div>
          <FeedbackCard :icon="false" />
        </v-card>

        <div>
          <div class="mb-3 flex items-center">
            <v-icon color="primary" class="mr-2">forum</v-icon>
            <span class="text-h6">{{ t('feedback.channel') }}</span>
          </div>

          <div class="flex flex-col gap-3">
            <v-card
              v-for="(channel, index) in feedbackChannels"
              :key="index"
              variant="outlined"
              hover
            >
              <v-card-text class="p-4">
                <div class="flex items-center justify-between gap-3">
                  <div class="flex min-w-0 flex-grow items-center">
                    <v-avatar
                      :color="channel.color"
                      size="40"
                      class="mr-3 flex-shrink-0"
                    >
                      <v-icon color="white">{{ channel.icon }}</v-icon>
                    </v-avatar>
                    <div class="min-w-0 flex-1">
                      <div class="text-h6">{{ channel.title }}</div>
                      <div class="text-body-2 text--secondary break-words">
                        {{ channel.description }}
                      </div>
                    </div>
                  </div>
                  <v-btn
                    rounded="pill"
                    :color="channel.color"
                    :href="channel.link"
                    :target="channel.target"
                    variant="flat"
                    class="flex-shrink-0"
                  >
                    {{ channel.buttonText }}
                    <v-icon end>open_in_new</v-icon>
                  </v-btn>
                </div>
              </v-card-text>
            </v-card>
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script lang="ts" setup>
import FeedbackCard from '../components/FeedbackCard.vue'
import { useDialog } from '../composables/dialog'

const { hide, isShown } = useDialog('feedback')
const { t } = useI18n()

const feedbackChannels = computed(() => [
  {
    title: t('feedback.github'),
    description: t('feedback.githubDescription'),
    icon: 'code',
    color: 'black',
    link: 'https://github.com/Voxelum/x-minecraft-launcher/issues/new',
    target: 'browser',
    buttonText: t('feedback.githubOpenIssue')
  },
  {
    title: t('feedback.qq'),
    description: t('feedback.qqDescription', { number: 858391850 }),
    icon: 'chat',
    color: 'blue',
    link: 'https://jq.qq.com/?_wv=1027&k=5Py5zM1',
    target: '_blank',
    buttonText: t('feedback.qqEnterGroup')
  },
  {
    title: t('feedback.kook'),
    description: t('feedback.kookDescription'),
    icon: 'chat',
    color: 'purple',
    link: 'https://kook.top/gqjSHh',
    target: 'browser',
    buttonText: t('feedback.qqEnterGroup')
  },
  {
    title: t('feedback.discord'),
    description: t('feedback.discordDescription'),
    icon: 'discord',
    color: 'indigo darken-2',
    link: 'https://discord.gg/W5XVwYY7GQ',
    target: 'browser',
    buttonText: t('feedback.discordJoin')
  }
])

watch(isShown, (v) => {
  if (v) {
    windowController.focus()
  }
})
</script>
