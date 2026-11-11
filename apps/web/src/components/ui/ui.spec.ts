import { describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { ApiError } from '@/lib/api'
import UiAlert from './UiAlert.vue'
import UiBadge from './UiBadge.vue'
import UiButton from './UiButton.vue'
import UiCard from './UiCard.vue'
import UiCheckbox from './UiCheckbox.vue'
import UiChip from './UiChip.vue'
import UiConfirm from './UiConfirm.vue'
import UiField from './UiField.vue'
import UiIcon from './UiIcon.vue'
import UiInput from './UiInput.vue'
import UiMenu from './UiMenu.vue'
import UiMenuItem from './UiMenuItem.vue'
import UiPopover from './UiPopover.vue'
import UiSegmented from './UiSegmented.vue'
import UiSelect from './UiSelect.vue'
import UiTextarea from './UiTextarea.vue'
import QueryState from './QueryState.vue'

describe('UiButton', () => {
  it('un bouton de 44 px au téléphone, principal ou secondaire, de type button par défaut', () => {
    const wrapper = mount(UiButton, {
      props: { variant: 'primary' },
      slots: { default: 'Enregistrer' },
    })
    const button = wrapper.get('button')
    expect(button.attributes('type')).toBe('button')
    expect(button.classes()).toContain('min-h-11')
    expect(button.classes()).toContain('bg-accent')
    expect(button.text()).toBe('Enregistrer')
  })

  it('en cours : désactivé, occupé, avec son libellé d’attente', () => {
    const wrapper = mount(UiButton, {
      props: { loading: true, loadingLabel: 'Enregistrement…', type: 'submit' },
      slots: { default: 'Enregistrer' },
    })
    const button = wrapper.get('button')
    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('aria-busy')).toBe('true')
    expect(button.text()).toBe('Enregistrement…')
    expect(wrapper.find('[data-icon="spinner"]').exists()).toBe(true)
  })

  it('destructif : encre du thème sur fond plein (lisible en sombre)', () => {
    const wrapper = mount(UiButton, { props: { variant: 'danger' } })
    expect(wrapper.get('button').classes()).toContain('text-bad-fg')
    expect(wrapper.get('button').classes()).not.toContain('text-white')
  })

  it('`href` en fait un lien avec le même habit, les attributs passent', () => {
    const wrapper = mount(UiButton, {
      props: { href: 'https://exemple.fr', variant: 'link' },
      attrs: { 'data-testid': 'go', target: '_blank' },
      slots: { default: 'Ouvrir' },
    })
    const link = wrapper.get('a')
    expect(link.attributes('href')).toBe('https://exemple.fr')
    expect(link.attributes('data-testid')).toBe('go')
    expect(link.classes()).toContain('underline')
  })
})

describe('UiIcon', () => {
  it('décorative, à la taille du texte', () => {
    const wrapper = mount(UiIcon, { props: { name: 'close' } })
    const svg = wrapper.get('svg')
    expect(svg.attributes('aria-hidden')).toBe('true')
    expect(svg.attributes('width')).toBe('1em')
    expect(svg.findAll('path')).toHaveLength(2)
  })
})

describe('UiField', () => {
  it('relie intitulé, unité, aide et erreur ; l’erreur rend le champ invalide', async () => {
    const wrapper = mount(UiField, {
      props: {
        id: 'f-surface',
        label: 'Surface Carrez',
        unit: 'm²',
        hint: 'Loi Carrez',
        error: '« 45 m² » n’est pas un nombre',
        modelValue: '45 m²',
      },
      attrs: {
        inputmode: 'decimal',
        'data-testid': 'surface',
        class: 'sm:col-span-2',
      },
    })
    const input = wrapper.get('input')
    expect(wrapper.get('label').attributes('for')).toBe('f-surface')
    expect(input.attributes('id')).toBe('f-surface')
    // Les attributs vont au champ, la classe au bloc.
    expect(input.attributes('data-testid')).toBe('surface')
    expect(input.attributes('inputmode')).toBe('decimal')
    expect(wrapper.get('[data-field="f-surface"]').classes()).toContain(
      'sm:col-span-2'
    )
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('aria-describedby')).toContain('f-surface-error')
    expect(input.attributes('aria-describedby')).toContain('f-surface-hint')
    expect(input.attributes('aria-describedby')).toContain('f-surface-unit')
    expect(input.classes()).toContain('text-base')
    expect(wrapper.get('[data-testid="field-error"]').text()).toContain(
      'n’est pas un nombre'
    )
    await input.setValue('45')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['45'])
  })

  it('« à compléter » et « modifié » en pastilles, select et textarea par `as`', () => {
    const wrapper = mount(UiField, {
      props: {
        id: 'f-dpe',
        label: 'DPE',
        as: 'select',
        missing: true,
        changed: true,
        options: [
          { value: '', label: '—' },
          { value: 'D', label: 'D' },
        ],
        modelValue: 'D',
      },
    })
    expect(wrapper.text()).toContain('à compléter')
    expect(wrapper.text()).toContain('modifié')
    expect(wrapper.get('[data-tone="warn"]').classes()).toContain(
      'text-warn-fg'
    )
    expect(wrapper.findAll('option')).toHaveLength(2)
    const area = mount(UiField, {
      props: { id: 'f-notes', label: 'Notes', as: 'textarea', rows: 4 },
    })
    expect(area.get('textarea').attributes('rows')).toBe('4')
  })

  it('avec un slot, l’appelant fournit le contrôle et reçoit id et description', () => {
    const wrapper = mount(UiField, {
      props: { id: 'f-x', label: 'X', hint: 'aide' },
      slots: {
        default: `<template #default="{ id, describedBy }"><output :id="id" :aria-describedby="describedBy" /></template>`,
      },
    })
    expect(wrapper.get('output').attributes('id')).toBe('f-x')
    expect(wrapper.get('output').attributes('aria-describedby')).toBe(
      'f-x-hint'
    )
  })
})

describe('UiInput, UiSelect, UiTextarea, UiCheckbox', () => {
  it('UiField relaie `.number` à sa case', async () => {
    const wrapper = mount(UiField, {
      props: {
        id: 'f-r',
        label: 'Rayon',
        modelValue: 500,
        modelModifiers: { number: true },
      },
    })
    await wrapper.get('input').setValue('800')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([800])
  })

  it('UiInput : chiffres à droite, `.number` relu en nombre', async () => {
    const wrapper = mount(UiInput, {
      props: { modelValue: 3, modelModifiers: { number: true } },
      attrs: { type: 'number' },
    })
    const input = wrapper.get('input')
    expect(input.classes()).toContain('text-right')
    await input.setValue('12')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([12])
  })

  it('UiSelect et UiTextarea : 16 px, erreur au contrôle', () => {
    const select = mount(UiSelect, {
      props: { options: [{ value: 'a', label: 'A' }], invalid: true },
    })
    expect(select.get('select').classes()).toContain('text-base')
    expect(select.get('select').attributes('aria-invalid')).toBe('true')
    const area = mount(UiTextarea, { attrs: { 'data-testid': 't' } })
    expect(area.get('textarea').attributes('data-testid')).toBe('t')
    expect(area.get('textarea').classes()).toContain('text-base')
  })

  it('UiCheckbox : la ligne entière est cliquable, le modèle suit', async () => {
    const wrapper = mount(UiCheckbox, {
      props: { label: 'Ascenseur', modelValue: false },
    })
    expect(wrapper.get('label').classes()).toContain('min-h-11')
    await wrapper.get('input').setValue(true)
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([true])
  })
})

describe('UiBadge, UiCard, UiChip, UiSegmented', () => {
  it('UiBadge : ton doux par défaut, plein avec l’encre du thème', () => {
    expect(
      mount(UiBadge, { props: { tone: 'good' } })
        .get('span')
        .classes()
    ).toContain('bg-good-soft')
    expect(
      mount(UiBadge, { props: { tone: 'bad', variant: 'solid' } })
        .get('span')
        .classes()
    ).toContain('text-bad-fg')
  })

  it('UiCard : une recette, nommée par son titre', () => {
    const wrapper = mount(UiCard, {
      props: { title: 'Prix et offres', level: 'h3' },
      slots: { default: 'contenu', actions: '<button>Modifier</button>' },
    })
    const section = wrapper.get('section')
    expect(section.classes()).toEqual(
      expect.arrayContaining(['rounded-2xl', 'p-4'])
    )
    const heading = wrapper.get('h3')
    expect(section.attributes('aria-labelledby')).toBe(heading.attributes('id'))
    expect(wrapper.text()).toContain('Modifier')
  })

  it('UiChip : une bascule (`aria-pressed`) avec son compteur', () => {
    const wrapper = mount(UiChip, {
      props: { selected: true, count: 4 },
      slots: { default: 'Talence' },
    })
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('true')
    expect(wrapper.text()).toContain('4')
  })

  it('UiSegmented : un choix parmi quelques-uns', async () => {
    const view = ref('list')
    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(UiSegmented, {
            label: 'Affichage',
            options: [
              { value: 'list', label: 'Liste' },
              { value: 'map', label: 'Carte' },
            ],
            modelValue: view.value,
            'onUpdate:modelValue': (next: string) => (view.value = next),
          }),
      })
    )
    expect(wrapper.get('[role="group"]').attributes('aria-label')).toBe(
      'Affichage'
    )
    await wrapper.get('[data-value="map"]').trigger('click')
    expect(view.value).toBe('map')
    await nextTick()
    expect(wrapper.get('[data-value="map"]').attributes('aria-pressed')).toBe(
      'true'
    )
  })
})

describe('UiConfirm', () => {
  it('confirme sur place : Annuler prend le focus, Échap revient au bouton', async () => {
    const onConfirm = vi.fn()
    const wrapper = mount(UiConfirm, {
      props: {
        label: 'Supprimer',
        question: 'Supprimer ce critère ?',
        onConfirm,
        confirmAttrs: { 'data-testid': 'confirm-delete' },
      },
      attrs: { 'data-testid': 'delete' },
      attachTo: document.body,
    })
    await wrapper.get('[data-testid="delete"]').trigger('click')
    await nextTick()
    expect(wrapper.text()).toContain('Supprimer ce critère ?')
    expect(document.activeElement?.textContent?.trim()).toBe('Annuler')
    await wrapper.get('[role="group"]').trigger('keydown', { key: 'Escape' })
    await nextTick()
    expect(wrapper.find('[data-testid="confirm-delete"]').exists()).toBe(false)
    expect((document.activeElement as HTMLElement | null)?.dataset.testid).toBe(
      'delete'
    )
    await wrapper.get('[data-testid="delete"]').trigger('click')
    await wrapper.get('[data-testid="confirm-delete"]').trigger('click')
    expect(onConfirm).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})

describe('UiAlert', () => {
  it('une erreur est annoncée tout de suite et propose « Réessayer »', async () => {
    const onRetry = vi.fn()
    const wrapper = mount(UiAlert, {
      props: { retry: true, onRetry },
      slots: { default: 'Pas de connexion.' },
    })
    expect(wrapper.attributes('role')).toBe('alert')
    await wrapper.get('[data-testid="retry"]').trigger('click')
    expect(onRetry).toHaveBeenCalled()
    const info = mount(UiAlert, { props: { tone: 'info' } })
    expect(info.attributes('role')).toBe('status')
  })
})

describe('QueryState', () => {
  const query = (state: {
    isPending?: boolean
    isError?: boolean
    error?: unknown
    data?: unknown
  }) => ({
    isPending: ref(state.isPending ?? false),
    isError: ref(state.isError ?? false),
    error: ref(state.error ?? null),
    isFetching: ref(false),
    data: ref(state.data),
    refetch: vi.fn(),
  })

  it('chargement : un squelette annoncé, pas de texte « Chargement… » à l’écran', () => {
    const wrapper = mount(QueryState, {
      props: { query: query({ isPending: true }), loadingLabel: 'la liste' },
      slots: { default: 'données' },
    })
    expect(wrapper.get('[role="status"]').attributes('aria-busy')).toBe('true')
    expect(wrapper.get('.sr-only').text()).toBe('Chargement de la liste…')
    expect(wrapper.find('[data-skeleton]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('données')
  })

  it('échec sans données : le message du serveur et « Réessayer », jamais « rien à faire »', async () => {
    const failed = query({
      isError: true,
      error: new ApiError(500, 'Le serveur ne répond pas.'),
    })
    const wrapper = mount(QueryState, {
      props: { query: failed, empty: true, emptyTitle: 'Rien à trier' },
      slots: { default: 'données' },
    })
    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Le serveur ne répond pas.'
    )
    expect(wrapper.text()).not.toContain('Rien à trier')
    await wrapper.get('[data-testid="retry"]').trigger('click')
    expect(failed.refetch).toHaveBeenCalled()
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })

  it('réseau coupé : le dit, sans jargon', () => {
    const wrapper = mount(QueryState, {
      props: {
        query: query({
          isError: true,
          error: new TypeError('Failed to fetch'),
        }),
      },
    })
    expect(wrapper.text()).toContain('Pas de connexion au serveur')
  })

  it('relecture échouée avec données : le contenu reste, sous un message', () => {
    const wrapper = mount(QueryState, {
      props: {
        query: query({ isError: true, error: new Error('x'), data: [1] }),
      },
      slots: { default: 'données' },
    })
    expect(wrapper.text()).toContain('données')
    expect(wrapper.find('[data-state="stale"]').exists()).toBe(true)
  })

  it('vide : dit quoi faire, parle des filtres et propose de les effacer', async () => {
    const wrapper = mount(QueryState, {
      props: {
        query: query({ data: [] }),
        empty: true,
        emptyTitle: 'Rien à valider',
        emptyText: 'Les annonces reçues par e-mail arrivent ici.',
        filtered: true,
      },
    })
    expect(wrapper.text()).toContain('Rien à valider')
    expect(wrapper.text()).toContain('Des filtres sont actifs')
    await wrapper.get('[data-testid="clear-filters"]').trigger('click')
    expect(wrapper.emitted('clearFilters')).toHaveLength(1)
  })

  it('sans requête : `pending` et `error` disent l’état', () => {
    const wrapper = mount(QueryState, {
      props: { error: new ApiError(404, 'Introuvable.') },
    })
    expect(wrapper.text()).toContain('Introuvable.')
  })
})

describe('UiMenu et UiPopover (reka-ui)', () => {
  it('UiMenu : s’ouvre au clic, les entrées sont des `menuitem`', async () => {
    const onSelect = vi.fn()
    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(
            UiMenu,
            { label: 'Exporter', 'data-testid': 'menu' },
            {
              default: () => [
                h(UiMenuItem, { onSelect }, () => 'CSV'),
                h(UiMenuItem, {}, () => 'JSON'),
              ],
            }
          ),
      }),
      { attachTo: document.body }
    )
    const trigger = document.body.querySelector(
      '[data-testid="menu"]'
    ) as HTMLElement
    trigger.click()
    await flushPromises()
    const items = [
      ...document.body.querySelectorAll('[role="menuitem"]'),
    ] as HTMLElement[]
    expect(items.map(item => item.textContent?.trim())).toEqual(['CSV', 'JSON'])
    items[0]?.click()
    await flushPromises()
    expect(onSelect).toHaveBeenCalled()
    wrapper.unmount()
  })

  it('UiPopover : un dialogue nommé, fermé par Échap', async () => {
    const wrapper = mount(
      defineComponent({
        setup: () => () =>
          h(
            UiPopover,
            { label: 'Notifications' },
            {
              trigger: () =>
                h(UiButton, { 'data-testid': 'open' }, () => 'Ouvrir'),
              default: () => h('p', 'contenu'),
            }
          ),
      }),
      { attachTo: document.body }
    )
    ;(
      document.body.querySelector('[data-testid="open"]') as HTMLElement
    ).click()
    await flushPromises()
    const dialog = document.body.querySelector(
      '[role="dialog"][aria-label="Notifications"]'
    )
    expect(dialog?.textContent).toContain('contenu')
    dialog?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    )
    await flushPromises()
    expect(
      document.body.querySelector('[role="dialog"][aria-label="Notifications"]')
    ).toBeNull()
    wrapper.unmount()
  })
})
