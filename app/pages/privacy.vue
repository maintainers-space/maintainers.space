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
            Signing in uses your own AT Protocol account (the same network Bluesky runs on). Your
            handle and DID come from your own PDS, the server you already trust with your identity
            &mdash; maintainers.space never stores a copy. Your AT Protocol session lives only in
            your browser.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">Connected forge accounts</h2>
          <p>
            Linking GitHub, GitLab, Codeberg, Gitea or Bitbucket runs an OAuth flow with that forge.
            The resulting access token is stored only in your browser's localStorage and is sent
            only to that forge's own API &mdash; never to maintainers.space's server, and never to
            any other third party. Signing out or unlinking an account removes it from your browser
            immediately.
          </p>
          <p>
            To prove a linked account is really yours (not just a claim you could edit on your own
            atproto record), maintainers.space's server signs a small attestation with a private key
            that never leaves the server. That signature covers only your DID, the forge, and your
            username on it &mdash; nothing else.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">What stays on your device</h2>
          <p>
            The rest of what makes maintainers.space feel personal &mdash; repos you've recently
            visited, which notifications you've already seen, dismissed banners, your accent color,
            linked accounts, and progress in the notifications mini-game &mdash; is tracked entirely
            in your browser's localStorage. None of it is sent anywhere. Clearing your browser data
            (or using "Clear history" where offered) removes it for good.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">Cookies</h2>
          <p>
            The forge sign-in flow sets a single short-lived cookie
            (<code>oauth_&lt;provider&gt;</code>) that carries the sign-in state for a few minutes
            and is read and deleted as soon as the OAuth response comes back. It is HTTP-only and
            never used to track you across sites or visits. There are no analytics, advertising or
            cross-site tracking cookies.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">What the server sees</h2>
          <p>
            maintainers.space's server has no database. It brokers the OAuth code exchange for forge
            sign-in, proxies and briefly caches anonymous public-data reads (so a page you and
            someone else both view doesn't hit a forge's API twice), and signs the account
            attestations described above. It does not log your forge tokens or build a profile of
            your activity.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">Third parties</h2>
          <p>
            Three kinds of third party are involved, and only because the app's core function
            requires them: the forges you choose to connect, the AT Protocol network your identity
            lives on, and Netlify, which hosts maintainers.space and caches public pages at the
            edge. Netlify sees standard request logs (IP address, requested URL, timestamp) like any
            web host. maintainers.space runs no analytics, no advertising, and does not sell data
            &mdash; there's nothing to sell.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">Data deletion</h2>
          <p>
            Signing out deletes the OAuth session your browser stored for this sign-in. Clearing
            your browser's site data removes the rest of the local state described above, and the
            forge sign-in cookie is deleted automatically after each flow. Because maintainers.space
            runs no server-side database, there is nothing to request deletion of from us.
          </p>
          <p>
            The linked-account record you published lives in your own AT Protocol repository, which
            is publicly readable and still entirely yours to manage &mdash; you can remove it from
            any AT Protocol client, your PDS, or a tool like
            <NuxtLink to="https://pdsls.dev" target="_blank" class="text-primary underline"
              >PDSls</NuxtLink
            >. Removing it also revokes the public "verified" claim on your profile.
          </p>
        </section>

        <section class="space-y-2">
          <h2 class="text-base font-semibold text-highlighted">Contact</h2>
          <p>
            If something on this page doesn't match what you see the app doing, or you have a
            security concern, open an issue or report a vulnerability on the
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
