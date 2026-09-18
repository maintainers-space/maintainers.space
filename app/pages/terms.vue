<script setup lang="ts">
useHead({ title: 'Terms' })
</script>

<template>
  <UDashboardPanel id="terms">
    <template #header>
      <UDashboardNavbar title="Terms">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-2xl space-y-8 py-2 text-sm text-default">
        <p class="text-xs text-dimmed">Last updated: September 2026</p>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">The software</h2>
          <p>
            maintainers.space is provided as-is, without warranty of any kind, under the
            <NuxtLink
              to="https://github.com/maintainers-space/maintainers.space/blob/main/LICENSE"
              target="_blank"
              class="text-primary underline"
              >MIT license</NuxtLink
            >. You're free to read, fork, modify and self-host it under that license's terms.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">Acceptance of these terms</h2>
          <p>
            By accessing or using maintainers.space, you agree to these terms and to the
            <NuxtLink to="/privacy" class="text-primary underline">Privacy Policy</NuxtLink>. If you
            don't agree, please don't use the service.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">Your data</h2>
          <p>
            Your AT Protocol identity, forge accounts and preferences belong to you.
            maintainers.space keeps no server-side copy of your personal data &mdash; what's stored
            is kept in your browser and described in the
            <NuxtLink to="/privacy" class="text-primary underline">Privacy Policy</NuxtLink>.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">Using the service</h2>
          <p>
            Use maintainers.space at your own risk and don't use it to do anything illegal or to
            abuse the forges it connects to (rate-limit evasion, scraping at scale, and similar). We
            reserve the right to restrict access for use that threatens the service for other
            people.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">Your connected accounts</h2>
          <p>
            Your AT Protocol identity and any forge accounts you connect remain entirely yours.
            maintainers.space is only a client &mdash; your use of each connected forge (GitHub,
            GitLab, Codeberg, Gitea, Bitbucket) is still governed by that forge's own terms of
            service, and your AT Protocol account by your PDS provider's terms.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">Disclaimer of warranties</h2>
          <p>
            The service is provided "as is" and "as available", without warranties of any kind,
            express or implied, including merchantability, fitness for a particular purpose and
            non-infringement. We don't warrant that the service will be uninterrupted, error-free or
            free of harmful components. You rely on it at your own discretion.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">Limitation of liability</h2>
          <p>
            To the fullest extent permitted by law, the maintainers of maintainers.space are not
            liable for any indirect, incidental, special, consequential or punitive damages arising
            from your use of, or inability to use, the service. Because your data lives in your own
            browser and on your own PDS, we're not responsible for data loss or availability issues
            caused by your PDS provider.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">Changes</h2>
          <p>
            These terms may change as the project evolves. Meaningful changes will be reflected here
            and in the project's
            <NuxtLink
              to="https://github.com/maintainers-space/maintainers.space"
              target="_blank"
              class="text-primary underline"
              >commit history</NuxtLink
            >, same as any other change to the code.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">Contact</h2>
          <p>
            Questions about these terms? Open an issue on the
            <NuxtLink
              to="https://github.com/maintainers-space/maintainers.space/issues"
              target="_blank"
              class="text-primary underline"
              >GitHub repository</NuxtLink
            >.
          </p>
        </section>

        <p class="text-muted">
          See also:
          <NuxtLink to="/privacy" class="text-primary underline">Privacy Policy</NuxtLink>.
        </p>
      </div>
    </template>
  </UDashboardPanel>
</template>
