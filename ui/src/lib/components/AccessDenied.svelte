<script lang="ts">
  let { pageName = 'this page', role = 'unknown' } = $props<{ pageName?: string; role?: string }>();
</script>

<div class="flex items-center justify-center min-h-[60vh]">
  <div class="text-center max-w-md px-6">
    <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
      <svg class="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    </div>
    <h2 class="text-xl font-semibold text-text-primary mb-2">Access Denied</h2>
    <p class="text-text-muted text-sm mb-4">
      Your role <span class="font-mono text-accent-cyan">({role})</span> does not have permission to access {pageName}.
    </p>
    <a href="/" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-bg-hover text-text-secondary hover:text-text-primary transition-colors text-sm">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
      Go to Chat
    </a>
  </div>
</div>
