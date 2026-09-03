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
        <p class="text-muted">
          maintainers.space has no database and no analytics. This page explains, plainly, where
          your data actually lives.
        </p>

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
            and progress in the notifications mini-game &mdash; is tracked entirely in your
            browser's localStorage. None of it is sent anywhere. Clearing your browser data (or
            using "Clear history" where offered) removes it for good.
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
          <h2 class="text-base font-semibold text-highlighted">Questions</h2>
          <p>
            maintainers.space is
            <NuxtLink
              to="https://github.com/maintainers-space/maintainers.space"
              target="_blank"
              class="text-primary underline"
              >open source</NuxtLink
            >, so you can read exactly how any of this works. Open an issue there if something on
            this page doesn't match what you see the app doing.
          </p>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>
