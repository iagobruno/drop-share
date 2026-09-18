<script setup lang="ts">
import { computed } from 'vue';
import type { ShareDetails } from '../types.js';
import AppIcon from './AppIcon.vue';

const props = defineProps<{
  share: ShareDetails | null;
  loading: boolean;
  downloading: boolean;
  downloaded: boolean;
  password: string;
  error: string;
}>();

const emit = defineEmits<{ download: []; 'update:password': [value: string] }>();
const expiryLabel = computed(() => props.share?.expiresAt ? new Date(props.share.expiresAt).toLocaleString('pt-BR') : '');
</script>

<template>
  <main class="download-layout">
    <section class="transfer-card download-card" :aria-busy="loading || downloading">
      <div v-if="loading" class="result-panel">
        <span class="result-icon"><span class="spinner" /></span><h1>Um instante…</h1><p role="status">Estamos verificando seu compartilhamento.</p>
      </div>
      <div v-else-if="downloaded && share?.expiration === 'one-download'" class="result-panel">
        <span class="result-icon"><AppIcon name="check" :size="30" /></span><h1>DOWNLOAD CONCLUÍDO!</h1><p>O download foi enviado ao seu navegador.<br />Este link de uso único não está mais disponível.</p>
        <a href="/" class="primary-button">Compartilhar meus arquivos <AppIcon name="arrow" :size="18" /></a>
      </div>
      <div v-else-if="share" class="result-panel">
        <span class="result-icon"><AppIcon name="download" :size="30" /></span><span class="card-kicker">UMA ENTREGA PARA VOCÊ</span><h1>Seus arquivos<br />estão aqui.</h1>
        <p>{{ share.fileCount }} {{ share.fileCount === 1 ? 'arquivo reunido' : 'arquivos reunidos' }} em um ZIP.</p>
        <div class="download-info"><AppIcon name="clock" :size="19" /><span>{{ share.expiration === 'one-download' ? 'Este link expira após o primeiro download.' : `Disponível até ${expiryLabel}.` }}</span></div>
        <form @submit.prevent="emit('download')">
          <div v-if="share.passwordProtected" class="download-password">
            <label for="download-password" class="field-label">SENHA DO COMPARTILHAMENTO</label>
            <input id="download-password" :value="password" :disabled="downloading" type="password" autocomplete="current-password" placeholder="Digite a senha que você recebeu" class="text-input" required @input="emit('update:password', ($event.target as HTMLInputElement).value)" />
          </div>
          <p v-if="error" role="alert" class="error-message">{{ error }}</p>
          <button type="submit" :disabled="downloading" class="primary-button"><span v-if="downloading" class="spinner" /><AppIcon v-else name="download" :size="19" />{{ downloading ? 'Preparando seu download…' : 'Baixar arquivos' }}</button>
        </form>
        <p v-if="downloaded" role="status" class="copy-status">Download enviado ao navegador.</p>
        <p class="card-reassurance"><AppIcon name="shield" :size="14" /> Compartilhamento protegido</p>
      </div>
      <div v-else class="result-panel">
        <span class="result-icon neutral"><AppIcon name="clock" :size="30" /></span><span class="card-kicker">ESSE LINK SE DESPEDIU</span><h1>Nem tudo dura<br />para sempre.</h1>
        <p>{{ error || 'Este compartilhamento expirou ou já foi baixado.' }}</p><p>Peça um novo link para quem enviou os arquivos.</p>
        <a href="/" class="secondary-button">Voltar ao início <AppIcon name="arrow" :size="17" /></a>
      </div>
    </section>
  </main>
</template>
