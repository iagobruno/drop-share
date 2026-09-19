<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Expiration } from '../types.js';
import { formatBytes } from '../utils/formatBytes.js';
import AppIcon from './AppIcon.vue';

const props = defineProps<{
  files: File[];
  expiration: Expiration;
  passwordEnabled: boolean;
  password: string;
  sending: boolean;
  error: string;
  totalBytes: number;
  totalLabel: string;
  maxBytes: number;
}>();

const emit = defineEmits<{
  addFiles: [files: FileList];
  removeFile: [index: number];
  clear: [];
  create: [];
  'update:expiration': [value: Expiration];
  'update:passwordEnabled': [value: boolean];
  'update:password': [value: string];
}>();

const picker = ref<HTMLInputElement>();
const dragging = ref(false);
const capacity = computed(() => Math.max(1, (props.totalBytes / props.maxBytes) * 100));

function selectFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files) emit('addFiles', input.files);
  input.value = '';
}

function finishDrop() {
  dragging.value = false;
}

function togglePassword() {
  const enabled = !props.passwordEnabled;
  emit('update:passwordEnabled', enabled);
  if (!enabled) emit('update:password', '');
}
</script>

<template>
  <section class="transfer-card" :aria-busy="sending" aria-label="Compartilhar arquivos">
    <fieldset :disabled="sending" class="upload-fields">
      <button
        type="button"
        class="dropzone"
        :class="{ 'is-dragging': dragging }"
        @dragover.prevent="dragging = true"
        @dragleave.prevent="dragging = false"
        @drop.prevent="finishDrop"
        @click="picker?.click()"
      >
        <span class="upload-art"><span class="file-back" /><span class="file-front"><AppIcon name="upload" :size="27" /></span><span class="art-plus"><AppIcon name="plus" :size="13" /></span></span>
        <strong>{{ dragging ? 'Pode soltar. A gente cuida do resto.' : 'Arraste seus arquivos aqui' }}</strong>
        <span>ou <span class="browse-link">escolha no seu dispositivo</span></span>
        <small>Qualquer formato · Até 1GB</small>
      </button>
      <input ref="picker" type="file" multiple class="sr-only" tabindex="-1" aria-label="Selecionar arquivos" @change="selectFiles" />

      <div v-if="files.length" class="selected-files">
        <div class="files-summary">
          <span>{{ files.length }} {{ files.length === 1 ? 'arquivo selecionado' : 'arquivos selecionados' }} <span class="muted">· {{ totalLabel }}</span></span>
          <button type="button" @click="emit('clear')" class="text-button">Limpar</button>
        </div>
        <ul class="file-list">
          <li v-for="(file, index) in files" :key="`${file.name}-${index}`" class="file-row">
            <span class="file-symbol"><AppIcon name="file" :size="18" /></span><span class="file-name" :title="file.name">{{ file.name }}</span><span class="file-size">{{ formatBytes(file.size) }}</span>
            <button type="button" @click="emit('removeFile', index)" class="icon-button" :aria-label="`Remover ${file.name}`"><AppIcon name="close" :size="16" /></button>
          </li>
        </ul>
        <div class="capacity-track" role="meter" aria-label="Espaço utilizado" :aria-valuenow="totalBytes" :aria-valuemax="maxBytes" aria-valuemin="0"><span :style="{ width: `${capacity}%` }" /></div>
      </div>

      <div class="options-heading"><span>OPÇÔES</span><span class="divider-line" /></div>
      <fieldset class="expiry-field">
        <legend><AppIcon name="clock" :size="16" /> Quando o link expira?</legend>
        <div class="expiry-options">
          <label class="expiry-choice" :class="{ selected: expiration === 'one-download' }"><input :checked="expiration === 'one-download'" type="radio" value="one-download" name="expiration" @change="emit('update:expiration', 'one-download')" /><span class="radio-indicator" /><span><strong>Após 1 download</strong><small>Baixou, o link desaparece.</small></span></label>
          <label class="expiry-choice" :class="{ selected: expiration === 'one-day' }"><input :checked="expiration === 'one-day'" type="radio" value="one-day" name="expiration" @change="emit('update:expiration', 'one-day')" /><span class="radio-indicator" /><span><strong>Após 24 horas</strong><small>Disponível por um dia.</small></span></label>
        </div>
      </fieldset>

      <div class="password-option">
        <button type="button" class="password-toggle" role="switch" :aria-checked="passwordEnabled" :aria-label="passwordEnabled ? 'Desativar proteção por senha' : 'Ativar proteção por senha'" @click="togglePassword">
          <span class="option-icon"><AppIcon name="lock" :size="18" /></span><span class="option-description"><strong>Proteger com senha</strong><small>Uma camada extra de privacidade.</small></span><span class="switch-track" :class="{ enabled: passwordEnabled }" aria-hidden="true" />
        </button>
        <div v-if="passwordEnabled" class="password-input-wrap">
          <label for="new-password" class="sr-only">Senha do compartilhamento</label>
          <input id="new-password" :value="password" type="password" minlength="4" maxlength="256" autocomplete="new-password" placeholder="Crie uma senha com pelo menos 4 caracteres" class="text-input" @input="emit('update:password', ($event.target as HTMLInputElement).value)" />
          <small>Envie a senha separadamente para quem vai receber.</small>
        </div>
      </div>
    </fieldset>
    <p v-if="error" role="alert" class="error-message">{{ error }}</p>
    <button @click="emit('create')" :disabled="sending || !files.length" class="primary-button create-link-button"><span v-if="sending" class="spinner" /><span>{{ sending ? 'Preparando seu compartilhamento…' : 'Criar link compartilhável' }}</span><AppIcon v-if="!sending" name="arrow" :size="19" /></button>
    <p class="card-reassurance"><AppIcon name="shield" :size="14" /> Seus arquivos são criptografados no servidor.</p>
  </section>
</template>
