<script setup lang="ts">
  import { computed } from 'vue'
  import {
    LISTING_PORTAL_LABELS,
    LISTING_PORTAL_SHORT_LABELS,
  } from '@apart/contracts'
  import type { ListingLink } from '@apart/contracts'
  import { orderLinks } from '@apart/domain'

  /**
   * Lot 18 : les portails où l'annonce est publiée, en pastilles (le lien
   * principal d'abord). Une pastille barrée et atténuée : le lien n'est plus
   * en ligne ; le titre le dit aussi, lisible sans la couleur. `short` donne
   * les libellés courts (LBC, SL, BI) de la liste et du mobile ; `linked`
   * fait de chaque pastille un lien vers la page, dans un nouvel onglet.
   */
  const props = withDefaults(
    defineProps<{
      links: readonly Pick<
        ListingLink,
        'id' | 'portal' | 'online' | 'url' | 'createdAt'
      >[]
      short?: boolean
      linked?: boolean
    }>(),
    { short: false, linked: false }
  )

  const chips = computed(() =>
    orderLinks(props.links).map(link => ({
      id: link.id,
      url: link.url,
      online: link.online,
      portal: link.portal,
      label: LISTING_PORTAL_LABELS[link.portal],
      shortLabel: LISTING_PORTAL_SHORT_LABELS[link.portal],
      title: `${LISTING_PORTAL_LABELS[link.portal]}${link.online ? '' : ' : plus en ligne'}`,
    }))
  )

  const chipClass = (online: boolean): string =>
    online
      ? 'border-accent/50 bg-accent-soft text-accent'
      : 'border-line bg-surface text-muted line-through'
</script>

<template>
  <span
    v-if="chips.length"
    class="inline-flex flex-wrap items-center gap-1"
    data-testid="portal-chips"
  >
    <template v-for="chip in chips" :key="chip.id">
      <a
        v-if="linked"
        :href="chip.url"
        target="_blank"
        rel="noopener noreferrer"
        class="rounded-md border px-1.5 py-px text-xs font-medium hover:underline"
        :class="chipClass(chip.online)"
        :title="chip.title"
        :data-portal="chip.portal"
        :data-online="chip.online"
        @click.stop
        ><template v-if="short">{{ chip.shortLabel }}</template
        ><template v-else
          ><span class="sm:hidden">{{ chip.shortLabel }}</span
          ><span class="hidden sm:inline">{{ chip.label }}</span></template
        ><span v-if="!chip.online" class="sr-only"> (plus en ligne)</span></a
      >
      <span
        v-else
        class="rounded-md border px-1.5 py-px text-xs font-medium"
        :class="chipClass(chip.online)"
        :title="chip.title"
        :data-portal="chip.portal"
        :data-online="chip.online"
        >{{ short ? chip.shortLabel : chip.label
        }}<span v-if="!chip.online" class="sr-only">
          (plus en ligne)</span
        ></span
      >
    </template>
  </span>
</template>
