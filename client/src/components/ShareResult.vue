<script setup lang="ts">
import type { Expiration } from '../types.js';
import AppIcon from './AppIcon.vue';

defineProps<{
  link: string;
  fileCount: number;
  totalLabel: string;
  expiration: Expiration;
  passwordEnabled: boolean;
  copied: boolean;
  error: string;
}>();

const emit = defineEmits<{ copy: []; reset: [] }>();
</script>

<template>
  <section class="transfer-card" aria-label="Link pronto para compartilhar">
    <div class="result-panel">
      <span class="result-icon"><AppIcon name="check" :size="30" /></span>
      <span class="card-kicker">TUDO PRONTO</span>
      <h2>Seus arquivos já estão protegidos prontos para serem baixados.</h2>
      <div class="result-stats">
        <span><AppIcon name="file" :size="16" /> {{ fileCount }} arquivo(s) · {{ totalLabel }}</span>
        <span><AppIcon name="clock" :size="16" /> {{ expiration === 'one-download' ? '1 download' : '24 horas' }}</span>
      </div>
      <label for="share-link" class="field-label">SEU LINK DE COMPARTILHAMENTO</label>
      <div class="link-field">
        <AppIcon name="link" :size="18" />
        <input id="share-link" readonly :value="link" @focus="($event.target as HTMLInputElement).select()" />
      </div>
      <button @click="emit('copy')" class="primary-button"><AppIcon :name="copied ? 'check' : 'copy'" :size="18" />{{ copied ? 'Link copiado!' : 'Copiar link' }}</button>
      <p role="status" class="copy-status">{{ copied ? 'Pronto para colar na sua próxima conversa.' : passwordEnabled ? 'Lembre-se de enviar a senha separadamente.' : 'Qualquer pessoa com o link pode baixar.' }}</p>
      <p v-if="error" role="alert" class="error-message">{{ error }}</p>
      <button @click="emit('reset')" class="secondary-button"><AppIcon name="plus" :size="17" /> Compartilhar mais arquivos</button>
    </div>
  </section>
</template>
