<script setup lang="ts">
import AppIcon from './AppIcon.vue';
</script>

<template>
  <section class="intro">
    <a href="/" class="brand hero-brand" aria-label="Drop Share — início">
      <span class="brand-mark"><AppIcon name="arrow" :size="22" /></span>
      drop<span class="brand-light">share</span><span class="brand-dot">.</span>
    </a>
    <h1>Compartilhamento de arquivos simples e <span class="accent-text">privado.</span></h1>
    <p class="intro-copy">
      Compartilhe documentos e arquivos atraves de links seguros com criptografia ponta a ponta que se expiram automaticamente.
    </p>
    <div class="intro-chips">
      <span><AppIcon name="shield" :size="16" /> Criptografia ponta a ponta</span>
      <span><AppIcon name="file" :size="16" /> Até 1 GB por link</span>
    </div>
    <div class="intro-footnote"><span class="mini-spark">✳</span> Solte. Envie. Pronto.</div>
  </section>
</template>
