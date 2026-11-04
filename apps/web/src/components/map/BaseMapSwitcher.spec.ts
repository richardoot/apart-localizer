import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import type { BaseMapId } from '@/lib/base-maps'
import BaseMapSwitcher from './BaseMapSwitcher.vue'

function radios(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('[role="radio"]')
}

describe('BaseMapSwitcher', () => {
  it('un groupe radio accessible : trois fonds, celui choisi coché et seul atteignable', () => {
    const wrapper = mount(BaseMapSwitcher, {
      props: { modelValue: 'ign-plan' },
    })
    const group = wrapper.get('[role="radiogroup"]')
    expect(group.attributes('aria-label')).toBe('Fond de carte')
    const buttons = radios(wrapper)
    expect(buttons.map(b => b.attributes('data-base-map'))).toEqual([
      'osm',
      'ign-plan',
      'ign-photo',
    ])
    expect(buttons.map(b => b.attributes('aria-checked'))).toEqual([
      'false',
      'true',
      'false',
    ])
    expect(buttons.map(b => b.attributes('tabindex'))).toEqual([
      '-1',
      '0',
      '-1',
    ])
    // Libellé court sur mobile, complet ailleurs ; cibles de 44 px sur mobile.
    expect(buttons[2]?.text()).toContain('Photo')
    expect(buttons[2]?.text()).toContain('Photo aérienne')
    expect(buttons[2]?.classes()).toContain('min-h-11')
    expect(buttons[2]?.attributes('title')).toContain('Photographies aériennes')
  })

  it('un clic choisit le fond', async () => {
    const wrapper = mount(BaseMapSwitcher, { props: { modelValue: 'osm' } })
    await radios(wrapper)[2]?.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([['ign-photo']])
  })

  it('flèches, Début et Fin déplacent le choix et le focus', async () => {
    const wrapper = mount(BaseMapSwitcher, {
      props: {
        modelValue: 'osm' as BaseMapId,
        'onUpdate:modelValue': (id: BaseMapId) =>
          wrapper.setProps({ modelValue: id }),
      },
      attachTo: document.body,
    })
    const group = wrapper.get('[role="radiogroup"]')
    await group.trigger('keydown', { key: 'ArrowRight' })
    await nextTick()
    expect(wrapper.props('modelValue')).toBe('ign-plan')
    expect(document.activeElement?.getAttribute('data-base-map')).toBe(
      'ign-plan'
    )
    await group.trigger('keydown', { key: 'ArrowDown' })
    await group.trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.props('modelValue')).toBe('osm')
    await group.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.props('modelValue')).toBe('ign-photo')
    await group.trigger('keydown', { key: 'Home' })
    expect(wrapper.props('modelValue')).toBe('osm')
    await group.trigger('keydown', { key: 'End' })
    expect(wrapper.props('modelValue')).toBe('ign-photo')
    await group.trigger('keydown', { key: 'ArrowUp' })
    expect(wrapper.props('modelValue')).toBe('ign-plan')
    const before = wrapper.emitted('update:modelValue')?.length
    await group.trigger('keydown', { key: 'a' })
    expect(wrapper.emitted('update:modelValue')?.length).toBe(before)
    wrapper.unmount()
  })
})
