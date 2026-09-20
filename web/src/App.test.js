import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import App from './App.vue'

function mountApp() {
  return mount(App, {
    attachTo: document.body,
  })
}

describe('Nginx config builder', () => {
  it('renders a valid default preview and enables both exports', () => {
    const wrapper = mountApp()

    expect(wrapper.find('.code-frame pre').exists()).toBe(true)
    expect(wrapper.find('.code-frame code').text()).toContain('worker_processes auto;')
    expect(wrapper.find('.primary-button').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('.secondary-button').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })

  it('switches to a reverse proxy and exposes only proxy fields', async () => {
    const wrapper = mountApp()
    await wrapper.find('#profile-proxy').setValue(true)

    expect(wrapper.find('#field-upstream').exists()).toBe(true)
    expect(wrapper.find('#field-documentRoot').exists()).toBe(false)
    expect(wrapper.text()).toContain('WebSocket upgrades')
    expect(wrapper.text()).not.toContain('Static asset caching')
    expect(wrapper.find('.code-frame code').text()).toContain('proxy_pass http://backend;')
    wrapper.unmount()
  })

  it('blocks export for an invalid host and reports an actionable error', async () => {
    const wrapper = mountApp()
    const input = wrapper.find('#field-serverName')
    await input.setValue('bad;return 444;')

    expect(input.attributes('aria-invalid')).toBe('true')
    expect(wrapper.find('.validation-box').text()).toContain('Server name')
    expect(wrapper.find('.primary-button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.secondary-button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('.code-frame pre').exists()).toBe(false)
    wrapper.unmount()
  })

  it('keeps the TLS and HSTS relationship visible in the form', async () => {
    const wrapper = mountApp()
    const httpsToggle = wrapper.find('#toggle-tls')
    const hstsToggle = wrapper.find('#toggle-hsts')

    expect(hstsToggle.attributes('disabled')).toBeDefined()
    await httpsToggle.setValue(true)
    expect(hstsToggle.attributes('disabled')).toBeUndefined()
    expect(wrapper.find('#field-certificatePath').exists()).toBe(true)
    await httpsToggle.setValue(false)
    expect(hstsToggle.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('resets profile-specific switches and chooses the profile upstream', async () => {
    const wrapper = mountApp()
    await wrapper.find('#field-documentRoot').setValue('/srv/custom-public')
    await wrapper.find('#profile-spa').setValue(true)
    expect(wrapper.find('#field-documentRoot').element.value).toBe('/srv/custom-public')
    await wrapper.find('#profile-static').setValue(true)
    expect(wrapper.find('#field-documentRoot').element.value).toBe('/srv/custom-public')

    await wrapper.find('#profile-php').setValue(true)
    expect(wrapper.find('#field-upstream').element.value).toBe('127.0.0.1:9000')
    await wrapper.find('#profile-proxy').setValue(true)
    expect(wrapper.find('#field-upstream').element.value).toBe('127.0.0.1:3000')

    await wrapper.find('#profile-static').setValue(true)
    await wrapper.find('#profile-proxy').setValue(true)
    expect(wrapper.find('#field-upstream').element.value).toBe('127.0.0.1:3000')

    await wrapper.find('#toggle-proxyCache').setValue(true)
    await wrapper.find('#profile-static').setValue(true)
    await wrapper.find('#profile-proxy').setValue(true)

    expect(wrapper.find('#toggle-proxyCache').element.checked).toBe(false)
    expect(wrapper.find('#toggle-streaming').element.checked).toBe(false)
    wrapper.unmount()
  })

  it('keeps streaming and proxy cache mutually exclusive', async () => {
    const wrapper = mountApp()
    await wrapper.find('#profile-proxy').setValue(true)
    const cache = wrapper.find('#toggle-proxyCache')
    const streaming = wrapper.find('#toggle-streaming')

    await cache.setValue(true)
    expect(streaming.attributes('disabled')).toBeDefined()
    await cache.setValue(false)
    await streaming.setValue(true)
    expect(cache.attributes('disabled')).toBeDefined()
    expect(cache.element.checked).toBe(false)
    wrapper.unmount()
  })

  it('exports the same text that is shown in the preview', async () => {
    const wrapper = mountApp()
    const OriginalBlob = globalThis.Blob
    let downloadedText = ''
    globalThis.Blob = class TestBlob extends OriginalBlob {
      constructor(parts, options) {
        super(parts, options)
        downloadedText = parts.join('')
      }
    }
    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    URL.createObjectURL = () => 'blob:test'
    URL.revokeObjectURL = () => {}
    const click = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = () => {}

    await wrapper.find('.primary-button').trigger('click')

    expect(downloadedText).toBe(wrapper.vm.configText)
    expect(downloadedText.trimEnd()).toBe(wrapper.find('.code-frame code').text().trimEnd())

    HTMLAnchorElement.prototype.click = click
    URL.createObjectURL = originalCreateObjectURL
    URL.revokeObjectURL = originalRevokeObjectURL
    globalThis.Blob = OriginalBlob
    wrapper.unmount()
  })

  it('copies renderer output and gives manual-select guidance when clipboard access fails', async () => {
    const wrapper = mountApp()
    const originalClipboard = navigator.clipboard
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    await wrapper.find('.secondary-button').trigger('click')
    await flushPromises()
    expect(writeText).toHaveBeenCalledWith(wrapper.vm.configText)
    expect(wrapper.find('.action-feedback').text()).toContain('Copied to clipboard')

    writeText.mockRejectedValueOnce(new Error('Permission denied'))
    await wrapper.find('.secondary-button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.action-feedback').text()).toContain('Select the preview and copy it manually.')

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: originalClipboard,
    })
    wrapper.unmount()
  })
})
