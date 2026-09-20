<script setup>
import { computed, reactive, ref, watch } from 'vue'
import {
  DEFAULT_OPTIONS,
  PRESETS,
  generateConfig,
  validateOptions,
} from '../../lib/config.js'
import { NGINX_VERSION } from '../../lib/version.js'
import {
  FIELD_LABELS,
  applyPreset,
  isFieldVisible,
  presetForProfile,
  validationEntries,
} from './app-logic.js'

const options = reactive({ ...DEFAULT_OPTIONS })
const copyState = ref('')

watch(options, () => {
  copyState.value = ''
}, { deep: true })

const presets = Array.isArray(PRESETS) ? PRESETS : []
const stableVersion = computed(() => String(NGINX_VERSION))

const selectedPreset = computed(() => presetForProfile(presets, options.profile))
const profileLabel = computed(() => selectedPreset.value?.label ?? options.profile)
const profileDescription = computed(() => selectedPreset.value?.description ?? '')

const validation = computed(() => {
  try {
    return validateOptions({ ...options })
  } catch (error) {
    return {
      valid: false,
      errors: { options: error instanceof Error ? error.message : 'Options could not be checked.' },
      options: null,
    }
  }
})

const errors = computed(() => validationEntries(validation.value.errors))
const renderResult = computed(() => {
  if (!validation.value.valid || !validation.value.options) {
    return { text: '', error: '' }
  }

  try {
    return { text: generateConfig(validation.value.options), error: '' }
  } catch (error) {
    return {
      text: '',
      error: error instanceof Error ? error.message : 'The configuration could not be rendered.',
    }
  }
})

const configText = computed(() => renderResult.value.text)
const renderError = computed(() => renderResult.value.error)
const hasConfig = computed(() => Boolean(configText.value))
const isValid = computed(() => validation.value.valid && !renderError.value && hasConfig.value)

function fieldError(field) {
  return validation.value.errors?.[field] ?? ''
}

function fieldId(field) {
  return `field-${field}`
}

function setProfile(profile) {
  const preset = presetForProfile(presets, profile)
  const previousProfile = { ...options }
  const nextProfile = { ...options, profile }
  // Keep the public identity and transport choices while resetting workload
  // fields and switches that belonged to the previous profile.
  const sharedFields = [
    'serverName',
    'listenPort',
    'httpsPort',
    'tls',
    'certificatePath',
    'certificateKeyPath',
    'gzip',
    'hsts',
  ]
  const shared = Object.fromEntries(sharedFields.map((field) => [field, options[field]]))
  const next = applyPreset({ ...DEFAULT_OPTIONS, ...shared, profile }, preset)
  // A document root is still meaningful across static, SPA, and PHP profiles.
  // An upstream is still meaningful across Go and reverse-proxy profiles.
  if (isFieldVisible(previousProfile, 'documentRoot') && isFieldVisible(nextProfile, 'documentRoot')) {
    next.documentRoot = previousProfile.documentRoot
  }
  if (['go', 'proxy'].includes(previousProfile.profile) && ['go', 'proxy'].includes(nextProfile.profile)) {
    next.upstream = previousProfile.upstream
  }
  Object.assign(options, next)
  copyState.value = ''
}

function updateToggle(field, event) {
  const checked = event.target.checked
  options[field] = checked

  // HSTS only makes sense with HTTPS. Proxy buffering and proxy caching are
  // deliberately exclusive because cached streaming responses are unsafe.
  if (field === 'tls' && !checked) options.hsts = false
  if (field === 'hsts' && !options.tls) options.hsts = false
  if (field === 'streaming' && checked) options.proxyCache = false
  if (field === 'proxyCache' && checked) options.streaming = false
}

function normalizePort(field) {
  if (options[field] === '' || options[field] === null || options[field] === undefined) return
  options[field] = Number(options[field])
}

function copyFallback(text) {
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const copied = document.execCommand('copy')
  textarea.remove()
  return copied
}

async function copyConfig() {
  if (!isValid.value) return

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(configText.value)
    } else if (!copyFallback(configText.value)) {
      throw new Error('Copy is not available in this browser.')
    }
    copyState.value = 'Copied to clipboard'
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Copy failed.'
    copyState.value = `${message} Select the preview and copy it manually.`
  }
}

function downloadConfig() {
  if (!isValid.value) return

  const blob = new Blob([configText.value], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'nginx.conf'
  link.click()
  URL.revokeObjectURL(url)
  copyState.value = 'Downloaded nginx.conf'
}

function resetOptions() {
  Object.assign(options, { ...DEFAULT_OPTIONS })
  copyState.value = ''
}

function showField(field) {
  return isFieldVisible(options, field)
}
</script>

<template>
  <main class="app-shell">
    <header class="topbar">
      <a class="brand" href="#top" aria-label="Nginx Config Builder home">
        <span class="brand-mark" aria-hidden="true">N</span>
        <span>
          <strong>Nginx Config Builder</strong>
          <small>Clear defaults for real deployments</small>
        </span>
      </a>
      <div class="topbar-meta" aria-label="Application details">
        <span class="version-pill">Nginx {{ stableVersion }}</span>
        <span class="browser-only"><span aria-hidden="true">●</span> Runs in your browser</span>
      </div>
    </header>

    <section id="top" class="hero" aria-labelledby="page-title">
      <div class="hero-copy">
        <p class="eyebrow">Configuration, without guesswork</p>
        <h1 id="page-title">Build a safer Nginx starting point.</h1>
        <p class="hero-lede">
          Pick the workload, answer a few practical questions, and download a complete configuration you can inspect and test.
          Every preview and export comes from the same validated renderer.
        </p>
        <div class="hero-notes" aria-label="Generator properties">
          <span><span aria-hidden="true">✓</span> No account</span>
          <span><span aria-hidden="true">✓</span> No external requests</span>
          <span><span aria-hidden="true">✓</span> Human-readable output</span>
        </div>
      </div>
      <div class="hero-card" aria-label="Current configuration summary">
        <span class="summary-label">Your profile</span>
        <strong>{{ profileLabel }}</strong>
        <span>{{ profileDescription || 'Choose a profile below to begin.' }}</span>
      </div>
    </section>

    <div class="workspace">
      <section class="panel form-panel" aria-labelledby="form-title">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">01 / Choose and tune</p>
            <h2 id="form-title">Tell us about this server</h2>
          </div>
          <button class="text-button" type="button" @click="resetOptions">Reset</button>
        </div>

        <fieldset class="profile-picker">
          <legend>What are you serving?</legend>
          <div class="profile-grid">
            <label
              v-for="preset in presets"
              :key="preset.id"
              class="profile-card"
              :class="{ selected: options.profile === preset.id }"
            >
              <input
                :id="`profile-${preset.id}`"
                :checked="options.profile === preset.id"
                type="radio"
                name="profile"
                :value="preset.id"
                @change="setProfile(preset.id)"
              />
              <span class="profile-card-content">
                <strong>{{ preset.label }}</strong>
                <span>{{ preset.description }}</span>
              </span>
              <span class="radio-dot" aria-hidden="true"></span>
            </label>
          </div>
        </fieldset>

        <div class="form-section">
          <div class="section-heading">
            <h3>Public address</h3>
            <p>Names and ports Nginx listens on. The default port keeps local and container testing simple.</p>
          </div>
          <div class="field-grid two-columns">
            <div class="field">
              <label :for="fieldId('serverName')">{{ FIELD_LABELS.serverName }}</label>
              <input
                :id="fieldId('serverName')"
                v-model="options.serverName"
                type="text"
                inputmode="url"
                autocomplete="url"
                placeholder="example.com"
                :aria-invalid="Boolean(fieldError('serverName'))"
                :aria-describedby="fieldError('serverName') ? `${fieldId('serverName')}-error` : undefined"
              />
              <p v-if="fieldError('serverName')" :id="`${fieldId('serverName')}-error`" class="field-error">{{ fieldError('serverName') }}</p>
              <p v-else class="field-help">Use a hostname or IPv4 address.</p>
            </div>
            <div class="field">
              <label :for="fieldId('listenPort')">{{ FIELD_LABELS.listenPort }}</label>
              <input
                :id="fieldId('listenPort')"
                v-model.number="options.listenPort"
                type="number"
                min="1"
                max="65535"
                inputmode="numeric"
                @blur="normalizePort('listenPort')"
                :aria-invalid="Boolean(fieldError('listenPort'))"
                :aria-describedby="fieldError('listenPort') ? `${fieldId('listenPort')}-error` : undefined"
              />
              <p v-if="fieldError('listenPort')" :id="`${fieldId('listenPort')}-error`" class="field-error">{{ fieldError('listenPort') }}</p>
              <p v-else class="field-help">Use {{ DEFAULT_OPTIONS.listenPort }} when you do not run as root.</p>
            </div>
            <div v-if="options.tls" class="field">
              <label :for="fieldId('httpsPort')">{{ FIELD_LABELS.httpsPort }}</label>
              <input
                :id="fieldId('httpsPort')"
                v-model.number="options.httpsPort"
                type="number"
                min="1"
                max="65535"
                inputmode="numeric"
                @blur="normalizePort('httpsPort')"
                :aria-invalid="Boolean(fieldError('httpsPort'))"
                :aria-describedby="fieldError('httpsPort') ? `${fieldId('httpsPort')}-error` : undefined"
              />
              <p v-if="fieldError('httpsPort')" :id="`${fieldId('httpsPort')}-error`" class="field-error">{{ fieldError('httpsPort') }}</p>
              <p v-else class="field-help">TLS is optional and needs a real certificate.</p>
            </div>
          </div>
        </div>

        <div v-if="showField('documentRoot') || showField('upstream')" class="form-section">
          <div class="section-heading">
            <h3>Files and upstreams</h3>
            <p>Use absolute paths inside the Nginx host or container. Never put a URL in the upstream field.</p>
          </div>
          <div class="field-grid">
            <div v-if="showField('documentRoot')" class="field">
              <label :for="fieldId('documentRoot')">{{ FIELD_LABELS.documentRoot }}</label>
              <input
                :id="fieldId('documentRoot')"
                v-model="options.documentRoot"
                type="text"
                placeholder="/srv/www/example.com/public"
                :aria-invalid="Boolean(fieldError('documentRoot'))"
                :aria-describedby="fieldError('documentRoot') ? `${fieldId('documentRoot')}-error` : undefined"
              />
              <p v-if="fieldError('documentRoot')" :id="`${fieldId('documentRoot')}-error`" class="field-error">{{ fieldError('documentRoot') }}</p>
              <p v-else class="field-help">The directory containing your public files.</p>
            </div>
            <div v-if="showField('upstream')" class="field">
              <label :for="fieldId('upstream')">{{ FIELD_LABELS.upstream }}</label>
              <input
                :id="fieldId('upstream')"
                v-model="options.upstream"
                type="text"
                placeholder="app:3000"
                :aria-invalid="Boolean(fieldError('upstream'))"
                :aria-describedby="fieldError('upstream') ? `${fieldId('upstream')}-error` : undefined"
              />
              <p v-if="fieldError('upstream')" :id="`${fieldId('upstream')}-error`" class="field-error">{{ fieldError('upstream') }}</p>
              <p v-else class="field-help">Hostname and port only, such as <code>app:3000</code>.</p>
            </div>
          </div>
        </div>

        <div class="form-section">
          <div class="section-heading">
            <h3>Transport and security</h3>
            <p>Turn on only what your deployment is ready to support. Certificates are read by Nginx; they are never uploaded here.</p>
          </div>
          <div class="toggle-list">
            <label class="toggle-row">
              <span>
                <strong>HTTPS</strong>
                <small>Serve encrypted traffic with your certificate and private key.</small>
              </span>
              <input id="toggle-tls" data-option="tls" :checked="options.tls" type="checkbox" @change="updateToggle('tls', $event)" />
              <span class="switch" aria-hidden="true"></span>
            </label>
            <div v-if="options.tls" class="field-grid two-columns nested-fields">
              <div class="field">
                <label :for="fieldId('certificatePath')">{{ FIELD_LABELS.certificatePath }}</label>
                <input
                  :id="fieldId('certificatePath')"
                  v-model="options.certificatePath"
                  type="text"
                  placeholder="/etc/nginx/tls/fullchain.pem"
                  :aria-invalid="Boolean(fieldError('certificatePath'))"
                  :aria-describedby="fieldError('certificatePath') ? `${fieldId('certificatePath')}-error` : undefined"
                />
                <p v-if="fieldError('certificatePath')" :id="`${fieldId('certificatePath')}-error`" class="field-error">{{ fieldError('certificatePath') }}</p>
                <p v-else class="field-help">Include the full certificate chain.</p>
              </div>
              <div class="field">
                <label :for="fieldId('certificateKeyPath')">{{ FIELD_LABELS.certificateKeyPath }}</label>
                <input
                  :id="fieldId('certificateKeyPath')"
                  v-model="options.certificateKeyPath"
                  type="text"
                  placeholder="/etc/nginx/tls/example.com.key"
                  :aria-invalid="Boolean(fieldError('certificateKeyPath'))"
                  :aria-describedby="fieldError('certificateKeyPath') ? `${fieldId('certificateKeyPath')}-error` : undefined"
                />
                <p v-if="fieldError('certificateKeyPath')" :id="`${fieldId('certificateKeyPath')}-error`" class="field-error">{{ fieldError('certificateKeyPath') }}</p>
                <p v-else class="field-help">Keep the private key readable only by Nginx.</p>
              </div>
            </div>
            <label class="toggle-row">
              <span>
                <strong>HSTS</strong>
                <small>Tell browsers to stay on HTTPS. Enable after HTTPS works everywhere.</small>
              </span>
              <input id="toggle-hsts" data-option="hsts" :checked="options.hsts" :disabled="!options.tls" type="checkbox" @change="updateToggle('hsts', $event)" />
              <span class="switch" aria-hidden="true"></span>
            </label>
          </div>
        </div>

        <div class="form-section">
          <div class="section-heading">
            <h3>Performance options</h3>
            <p>These are conservative switches. Measure your workload before changing the generated values.</p>
          </div>
          <div class="toggle-list">
            <label class="toggle-row">
              <span>
                <strong>Response compression</strong>
                <small v-if="['static', 'spa'].includes(options.profile)">Compress public text assets when the client supports it.</small>
                <small v-else>Compress text responses from the application. Review reflected input and BREACH risk before enabling.</small>
              </span>
              <input id="toggle-gzip" data-option="gzip" :checked="options.gzip" type="checkbox" @change="updateToggle('gzip', $event)" />
              <span class="switch" aria-hidden="true"></span>
            </label>
            <label v-if="showField('assetCache')" class="toggle-row">
              <span>
                <strong>Static asset caching</strong>
                <small>Long cache lifetimes for matching static files. Enable only when every matching filename is content-addressed.</small>
              </span>
              <input id="toggle-assetCache" data-option="assetCache" :checked="options.assetCache" type="checkbox" @change="updateToggle('assetCache', $event)" />
              <span class="switch" aria-hidden="true"></span>
            </label>
            <label v-if="showField('websocket')" class="toggle-row">
              <span>
                <strong>WebSocket upgrades</strong>
                <small>Enable upgrade handling for this proxy profile. Split it into a route-specific location when other paths are ordinary HTTP.</small>
              </span>
              <input id="toggle-websocket" data-option="websocket" :checked="options.websocket" type="checkbox" @change="updateToggle('websocket', $event)" />
              <span class="switch" aria-hidden="true"></span>
            </label>
            <label v-if="showField('streaming')" class="toggle-row">
              <span>
                <strong>Streaming responses</strong>
                <small>Reduce response buffering for this proxy profile. Request buffering stays on; use a separate location for SSE or long-lived output. Disables proxy cache.</small>
              </span>
              <input id="toggle-streaming" data-option="streaming" :checked="options.streaming" :disabled="options.proxyCache" type="checkbox" @change="updateToggle('streaming', $event)" />
              <span class="switch" aria-hidden="true"></span>
            </label>
            <label v-if="showField('proxyCache')" class="toggle-row">
              <span>
                <strong>Proxy cache</strong>
                <small>Cache safe upstream responses for this proxy profile. Review cache rules for private data first. Disables streaming.</small>
              </span>
              <input id="toggle-proxyCache" data-option="proxyCache" :checked="options.proxyCache" :disabled="options.streaming" type="checkbox" @change="updateToggle('proxyCache', $event)" />
              <span class="switch" aria-hidden="true"></span>
            </label>
            <label v-if="showField('rateLimit')" class="toggle-row">
              <span>
                <strong>Request rate limit</strong>
                <small>Apply a basic per-client limit to the whole server. Split it into locations when limits differ by endpoint.</small>
              </span>
              <input id="toggle-rateLimit" data-option="rateLimit" :checked="options.rateLimit" type="checkbox" @change="updateToggle('rateLimit', $event)" />
              <span class="switch" aria-hidden="true"></span>
            </label>
          </div>
        </div>

        <div v-if="errors.length || renderError" class="validation-box" role="alert" aria-live="polite">
          <strong>Fix these before exporting</strong>
          <ul>
            <li v-for="entry in errors" :key="entry.field">
              <span v-if="entry.label !== entry.field">{{ entry.label }}: </span>{{ entry.message }}
            </li>
            <li v-if="renderError">{{ renderError }}</li>
          </ul>
        </div>
      </section>

      <aside class="preview-column" aria-labelledby="preview-title">
        <section class="panel preview-panel">
          <div class="panel-heading preview-heading">
            <div>
              <p class="eyebrow">02 / Inspect and export</p>
              <h2 id="preview-title">Your nginx.conf</h2>
            </div>
            <span class="status-dot" :class="{ ready: isValid }"><span aria-hidden="true">●</span> {{ isValid ? 'Ready' : 'Needs input' }}</span>
          </div>
          <div class="export-actions export-actions-top">
            <button class="primary-button" type="button" :disabled="!isValid" @click="downloadConfig">
              <span aria-hidden="true">↓</span> Download nginx.conf
            </button>
            <button class="secondary-button" type="button" :disabled="!isValid" @click="copyConfig">
              <span aria-hidden="true">□</span> Copy config
            </button>
          </div>
          <p class="action-feedback action-feedback-top" aria-live="polite">{{ copyState }}</p>
          <div class="code-frame" :class="{ empty: !hasConfig }">
            <pre v-if="hasConfig"><code>{{ configText }}</code></pre>
            <div v-else class="empty-preview">
              <span class="empty-icon" aria-hidden="true">{ }</span>
              <strong>Your validated configuration will appear here.</strong>
              <span>Complete the highlighted fields to unlock export.</span>
            </div>
          </div>
        </section>

        <section class="setup-card" aria-labelledby="setup-title">
          <p class="eyebrow">Before you reload</p>
          <h2 id="setup-title">Three quick checks</h2>
          <ol class="setup-list">
            <li><strong>Place the files.</strong> Make sure the document root, upstream, and certificate paths exist where Nginx runs.</li>
            <li><strong>Check the syntax.</strong> Run <code>nginx -t -c /path/to/nginx.conf</code> as the same user or container that will serve it.</li>
            <li><strong>Reload carefully.</strong> Only reload after the check passes; keep a known-good configuration ready.</li>
          </ol>
          <p class="setup-note">The generated HTTP listener defaults to port <code>{{ DEFAULT_OPTIONS.listenPort }}</code>. Use an unprivileged port unless your service manager grants the needed capability.</p>
        </section>
      </aside>
    </div>

    <footer class="footer">
      <span>Nginx {{ stableVersion }}</span>
      <span>Review every generated directive for your application and traffic.</span>
    </footer>
  </main>
</template>
