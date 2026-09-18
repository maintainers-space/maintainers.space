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
            maintainers.space is published under the
            <NuxtLink
              to="https://github.com/maintainers-space/maintainers.space/blob/main/LICENSE"
              target="_blank"
              class="text-primary underline"
              >MIT license</NuxtLink
            >
            and is provided as is, without warranty of any kind. You may read, fork, modify and
            self-host it under the terms of that license.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">Acceptance</h2>
          <p>
            By using maintainers.space you agree to these terms and to the
            <NuxtLink to="/privacy" class="text-primary underline">Privacy Policy</NuxtLink>. If you
            do not agree, do not use the service.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">Your data</h2>
          <p>
            Your AT Protocol identity, connected forge accounts and preferences remain yours.
            maintainers.space keeps none of it on its servers. What is stored is kept in your
            browser and described in the
            <NuxtLink to="/privacy" class="text-primary underline">Privacy Policy</NuxtLink>.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">Use of the service</h2>
          <p>
            Do not use maintainers.space for unlawful purposes or in ways that abuse the services it
            connects to, such as rate-limit evasion or large-scale scraping. We may restrict access
            to protect the service and its users.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">Your connected accounts</h2>
          <p>
            Your AT Protocol identity and connected forge accounts remain under your control.
            maintainers.space acts as a client. Your use of each connected forge (GitHub, GitLab,
            Codeberg, Gitea, Bitbucket) is governed by that forge's terms of service, and your AT
            Protocol account by your PDS provider's terms.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">Disclaimer of warranties</h2>
          <p>
            The service is provided on an "as is" and "as available" basis without warranties of any
            kind, express or implied, including merchantability, fitness for a particular purpose
            and non-infringement. We do not warrant that the service will be uninterrupted,
            error-free or secure.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">Limitation of liability</h2>
          <p>
            To the fullest extent permitted by law, the maintainers of maintainers.space are not
            liable for indirect, incidental, special, consequential or punitive damages arising from
            your use of or inability to use the service. Because your data lives in your own browser
            and on your own PDS, we are not responsible for data loss or availability issues caused
            by your PDS provider.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">Changes</h2>
          <p>
            These terms may change as the project evolves. Material changes will be noted on this
            page and in the project's
            <NuxtLink
              to="https://github.com/maintainers-space/maintainers.space"
              target="_blank"
              class="text-primary underline"
              >commit history</NuxtLink
            >. Continuing to use the service after a change means you accept the updated terms.
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
