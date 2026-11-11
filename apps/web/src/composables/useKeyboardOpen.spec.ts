/**
 * Lot 23 : le clavier à l'écran, déduit du champ qui a le focus (Safari iOS
 * ne le dit pas) ; la barre du bas se retire tant qu'il est ouvert.
 */
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import type { Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { opensKeyboard, useKeyboardOpen } from './useKeyboardOpen'

const input = (type: string, attrs: Record<string, unknown> = {}) => {
  const el = document.createElement('input')
  el.type = type
  Object.assign(el, attrs)
  return el
}

describe('opensKeyboard', () => {
  it('un champ de texte, de nombre, une zone de texte, une liste : oui', () => {
    expect(opensKeyboard(input('text'))).toBe(true)
    expect(opensKeyboard(input('email'))).toBe(true)
    expect(opensKeyboard(input('number'))).toBe(true)
    expect(opensKeyboard(document.createElement('textarea'))).toBe(true)
    expect(opensKeyboard(document.createElement('select'))).toBe(true)
  })

  it('une case, un bouton, un champ désactivé ou en lecture seule : non', () => {
    expect(opensKeyboard(input('checkbox'))).toBe(false)
    expect(opensKeyboard(input('radio'))).toBe(false)
    expect(opensKeyboard(input('submit'))).toBe(false)
    expect(opensKeyboard(input('text', { disabled: true }))).toBe(false)
    expect(opensKeyboard(input('text', { readOnly: true }))).toBe(false)
    const area = document.createElement('textarea')
    area.disabled = true
    expect(opensKeyboard(area)).toBe(false)
    expect(opensKeyboard(document.createElement('button'))).toBe(false)
    expect(opensKeyboard(null)).toBe(false)
    expect(opensKeyboard(window)).toBe(false)
  })
})

describe('useKeyboardOpen', () => {
  it('suit le focus d’un champ, et le rend à sa sortie', async () => {
    const probe: { open: Ref<boolean> } = { open: ref(false) }
    const Probe = defineComponent({
      setup() {
        probe.open = useKeyboardOpen()
        return () =>
          h('div', [
            h('input', { type: 'text', id: 'txt' }),
            h('input', { type: 'checkbox', id: 'box' }),
          ])
      },
    })
    const wrapper = mount(Probe, { attachTo: document.body })
    expect(probe.open.value).toBe(false)
    ;(document.getElementById('txt') as HTMLInputElement).focus()
    await nextTick()
    expect(probe.open.value).toBe(true)
    ;(document.getElementById('box') as HTMLInputElement).focus()
    await new Promise(resolve => setTimeout(resolve, 5))
    expect(probe.open.value).toBe(false)
    wrapper.unmount()
  })
})
