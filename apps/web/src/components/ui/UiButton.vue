<script setup lang="ts">
  import { computed } from 'vue'
  import type { RouteLocationRaw } from 'vue-router'
  import { buttonClasses } from '@/lib/ui'
  import type { ButtonSize, ButtonVariant } from '@/lib/ui'
  import type { IconName } from '@/lib/icons'
  import UiIcon from './UiIcon.vue'

  /**
   * Lot 22 : le bouton de l'application. Principal (une action par zone),
   * secondaire, contour, destructif, discret ou lien ; 44 px au téléphone.
   * `loading` désactive le bouton, l'annonce occupé (`aria-busy`) et montre
   * `loadingLabel` (« Enregistrement… ») s'il est donné. `to` en fait un
   * lien du routeur, `href` un lien externe, avec le même habit.
   */
  const props = withDefaults(
    defineProps<{
      variant?: ButtonVariant | undefined
      size?: ButtonSize | undefined
      type?: 'button' | 'submit' | 'reset' | undefined
      loading?: boolean | undefined
      loadingLabel?: string | undefined
      disabled?: boolean | undefined
      icon?: IconName | undefined
      iconRight?: IconName | undefined
      block?: boolean | undefined
      to?: RouteLocationRaw | undefined
      href?: string | undefined
    }>(),
    {
      loadingLabel: undefined,
      icon: undefined,
      iconRight: undefined,
      to: undefined,
      href: undefined,
      variant: 'secondary',
      size: 'md',
      type: 'button',
      loading: false,
      disabled: false,
      block: false,
    }
  )

  const classes = computed(() =>
    buttonClasses({
      variant: props.variant,
      size: props.size,
      block: props.block,
    })
  )
  const inactive = computed(() => props.disabled || props.loading)
</script>

<template>
  <RouterLink v-if="to !== undefined" :to="to" :class="classes">
    <UiIcon v-if="icon" :name="icon" />
    <slot />
    <UiIcon v-if="iconRight" :name="iconRight" />
  </RouterLink>
  <a v-else-if="href !== undefined" :href="href" :class="classes">
    <UiIcon v-if="icon" :name="icon" />
    <slot />
    <UiIcon v-if="iconRight" :name="iconRight" />
  </a>
  <button
    v-else
    :type="type"
    :class="classes"
    :disabled="inactive"
    :aria-busy="loading ? 'true' : undefined"
  >
    <UiIcon v-if="loading" name="spinner" />
    <UiIcon v-else-if="icon" :name="icon" />
    <template v-if="loading && loadingLabel">{{ loadingLabel }}</template>
    <slot v-else />
    <UiIcon v-if="iconRight && !loading" :name="iconRight" />
  </button>
</template>
