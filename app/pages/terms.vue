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
        <p class="text-muted">
          Kept short on purpose. maintainers.space is a free, open-source project, not a company
          with a legal team.
        </p>

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

        <p class="text-muted">
          See also: <NuxtLink to="/privacy" class="text-primary underline">Privacy</NuxtLink>.
        </p>
      </div>
    </template>
  </UDashboardPanel>
</template>
