<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import DownloadPage from './components/DownloadPage.vue';
import HomeIntroduction from './components/HomeIntroduction.vue';
import ShareForm from './components/ShareForm.vue';
import ShareResult from './components/ShareResult.vue';
import type { Expiration, ShareDetails } from './types.js';
import { formatBytes } from './utils/formatBytes.js';

const MAX_BYTES = 1024 * 1024 * 1024;
const shareId = window.location.pathname.match(/^\/s\/([a-f0-9-]{36})$/i)?.[1];

const files = ref<File[]>([]);
const expiration = ref<Expiration>('one-download');
const passwordEnabled = ref(false);
const password = ref('');
const sending = ref(false);
const createdLink = ref('');
const error = ref('');
const copied = ref(false);
const share = ref<ShareDetails | null>(null);
const loadingShare = ref(Boolean(shareId));
const downloadPassword = ref('');
const downloading = ref(false);
const downloaded = ref(false);

const totalBytes = computed(() => files.value.reduce((sum, file) => sum + file.size, 0));
const totalLabel = computed(() => formatBytes(totalBytes.value));

function addFiles(incoming: FileList) {
  if (sending.value) return;
  error.value = '';
  const known = new Set(files.value.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
  const additions = Array.from(incoming).filter((file) => !known.has(`${file.name}:${file.size}:${file.lastModified}`));
  const next = [...files.value, ...additions];

  if (next.reduce((sum, file) => sum + file.size, 0) > MAX_BYTES) {
    error.value = 'O total dos arquivos não pode ultrapassar 1 GB.';
    return;
  }
  files.value = next;
}

function removeFile(index: number) {
  if (!sending.value) files.value.splice(index, 1);
}

function reset() {
  copied.value = false;
  files.value = [];
  password.value = '';
  passwordEnabled.value = false;
  createdLink.value = '';
  error.value = '';
}

async function createShare() {
  if (sending.value) return;
  error.value = '';
  if (!files.value.length) return (error.value = 'Adicione ao menos um arquivo para continuar.');
  if (passwordEnabled.value && password.value.length < 4) return (error.value = 'Use uma senha de pelo menos 4 caracteres.');

  sending.value = true;
  try {
    const form = new FormData();
    files.value.forEach((file) => form.append('files', file));
    form.append('expiration', expiration.value);
    if (passwordEnabled.value) form.append('password', password.value);

    const response = await fetch('/api/shares', { method: 'POST', body: form });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Não foi possível criar o link.');
    createdLink.value = data.url;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Não foi possível criar o link.';
  } finally {
    sending.value = false;
  }
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(createdLink.value);
    copied.value = true;
  } catch {
    error.value = 'Não foi possível copiar. Selecione o link e copie manualmente.';
  }
}

async function loadShare() {
  if (!shareId) return;
  try {
    const response = await fetch(`/api/shares/${shareId}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    share.value = data;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Link indisponível.';
  } finally {
    loadingShare.value = false;
  }
}

async function download() {
  if (!shareId || downloading.value) return;
  error.value = '';
  downloading.value = true;
  try {
    const response = await fetch(`/api/shares/${shareId}/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: downloadPassword.value }),
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error ?? 'Não foi possível baixar o arquivo.');
    }

    const objectUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = 'drop-share.zip';
    link.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    downloaded.value = true;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Não foi possível baixar o arquivo.';
  } finally {
    downloading.value = false;
  }
}

onMounted(loadShare);
</script>

<template>
  <div class="app-shell">
    <main v-if="!shareId" class="main-layout">
      <HomeIntroduction />
      <ShareResult
        v-if="createdLink"
        :link="createdLink"
        :file-count="files.length"
        :total-label="totalLabel"
        :expiration="expiration"
        :password-enabled="passwordEnabled"
        :copied="copied"
        :error="error"
        @copy="copyLink"
        @reset="reset"
      />
      <ShareForm
        v-else
        :files="files"
        :expiration="expiration"
        :password-enabled="passwordEnabled"
        :password="password"
        :sending="sending"
        :error="error"
        :total-bytes="totalBytes"
        :total-label="totalLabel"
        :max-bytes="MAX_BYTES"
        @add-files="addFiles"
        @remove-file="removeFile"
        @clear="reset"
        @create="createShare"
        @update:expiration="expiration = $event"
        @update:password-enabled="passwordEnabled = $event"
        @update:password="password = $event"
      />
    </main>
    <DownloadPage
      v-else
      :share="share"
      :loading="loadingShare"
      :downloading="downloading"
      :downloaded="downloaded"
      :password="downloadPassword"
      :error="error"
      @download="download"
      @update:password="downloadPassword = $event"
    />
  </div>
</template>
