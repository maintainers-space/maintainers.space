<script setup lang="ts">
useHead({ title: 'Privacy' })
</script>

<template>
  <UDashboardPanel id="privacy">
    <template #header>
      <UDashboardNavbar title="Privacy">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-2xl space-y-8 py-2 text-sm text-default">
        <p class="text-xs text-dimmed">Last updated: September 2026</p>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">Your identity</h2>
          <p>
            Sign-in uses an AT Protocol account through your own Personal Data Server (PDS), for
            example Bluesky or a self-hosted server. Your handle and DID are resolved from your PDS,
            which is the server you chose to host your identity. maintainers.space does not store a
            copy of your handle or DID. Your AT Protocol session is kept in your browser only.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">Connected forge accounts</h2>
          <p>
            Connecting GitHub, GitLab, Codeberg, Gitea or Bitbucket starts an OAuth flow with that
            service. The access token it returns is stored in your browser's localStorage and is
            sent only to that service's API. It is never sent to maintainers.space's servers and is
            never shared with other parties. Signing out or disconnecting an account removes the
            token from your browser.
          </p>
          <p>
            To let others verify that a connected account is yours, maintainers.space's server signs
            a short attestation with a private key that stays on the server. The signature covers
            your DID, the service and your username on it, and nothing else.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">Data stored on your device</h2>
          <p>
            Everything else that makes the service personal is stored in your browser's
            localStorage: recently viewed repositories, read notifications, dismissed messages, your
            accent color and your linked accounts. None of it is sent to maintainers.space. Clearing
            your browser's site data removes it.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">Cookies</h2>
          <p>
            During forge sign-in the server sets one short-lived, HTTP-only cookie,
            <code>oauth_&lt;provider&gt;</code>, to carry the sign-in state. It is read once and
            deleted when the OAuth response is returned. maintainers.space sets no analytics,
            advertising or tracking cookies.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">What the server handles</h2>
          <p>
            maintainers.space runs no database. Its server completes the OAuth code exchange for
            forge sign-in, proxies and briefly caches anonymous public reads so that repeated views
            of the same page do not hit a forge's API twice, and signs the attestations described
            above. It does not log forge tokens and does not build a profile of your activity.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">Third-party services</h2>
          <p>
            Three providers are involved, and only where a feature requires them: the forge services
            you choose to connect, the AT Protocol network that hosts your identity, and Netlify,
            which hosts maintainers.space and serves public pages from a content delivery network.
            Netlify receives standard request logs (IP address, requested URL, timestamp), as any
            web host does. maintainers.space runs no analytics and no advertising and does not sell
            data.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">Data deletion</h2>
          <p>
            Sign out to delete the AT Protocol session stored in your browser. Clearing your
            browser's site data removes the other local state described above. The forge sign-in
            cookie is deleted automatically when the OAuth flow completes. Because maintainers.space
            keeps no server-side database, there is nothing to request deletion of from us.
          </p>
          <p>
            The records you publish, including connected forge accounts, live in your own AT
            Protocol repository, which is publicly readable. You can inspect and delete them with
            any AT Protocol client, through your PDS, or with a tool such as
            <NuxtLink to="https://pdsls.dev" target="_blank" class="text-primary underline"
              >PDSls</NuxtLink
            >. Removing a connected account also removes the public "verified" badge on your
            profile.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">Contact</h2>
          <p>
            To ask a question or report a security issue, open an issue on the
            <NuxtLink
              to="https://github.com/maintainers-space/maintainers.space"
              target="_blank"
              class="text-primary underline"
              >GitHub repository</NuxtLink
            >.
          </p>
        </section>

        <p class="text-muted">
          See also:
          <NuxtLink to="/terms" class="text-primary underline">Terms of Service</NuxtLink>.
        </p>
      </div>
    </template>
  </UDashboardPanel>
</template>
